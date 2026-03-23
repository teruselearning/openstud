
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import path from 'path';
import process from 'process';
import nodemailer from 'nodemailer';
import { GoogleGenAI, Type } from "@google/genai";

declare const __dirname: string;

dotenv.config();

let dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'openstudbook',
  port: Number(process.env.DATABASE_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4"
};

let pool: mysql.Pool | null = null;
let isConfigured = false;

const getDb = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
};

const resetPool = (newConfig: any) => {
  if (pool) {
    pool.end();
  }
  dbConfig = { ...dbConfig, ...newConfig };
  pool = mysql.createPool(dbConfig);
};

const app: any = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'openstudbook-stable-dev-secret-2024';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// --- AI Service Definitions ---
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

const speciesSchema = {
  type: Type.OBJECT,
  properties: {
    scientificName: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["Animal", "Plant"] },
    conservationStatus: { type: Type.STRING },
    sexualMaturityAgeYears: { type: Type.NUMBER },
    averageAdultWeightKg: { type: Type.NUMBER },
    lifeExpectancyYears: { type: Type.NUMBER },
    breedingSeasonStart: { type: Type.INTEGER },
    breedingSeasonEnd: { type: Type.INTEGER },
    plantClassification: { type: Type.STRING },
    nativeStatusCountry: { type: Type.STRING },
    nativeStatusLocal: { type: Type.STRING },
    description: { type: Type.STRING }
  },
  required: ["scientificName", "conservationStatus", "type"],
};

const translationSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      k: { type: Type.STRING },
      v: { type: Type.STRING }
    },
    required: ["k", "v"]
  }
};

const sanitizeJsonResponse = (text: string): string => {
  if (!text) return "";
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "");
  }
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let start = -1;
  let end = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = clean.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = clean.lastIndexOf(']');
  }
  if (start !== -1 && end !== -1 && end > start) {
    return clean.substring(start, end + 1);
  }
  return clean;
};

const runMigrations = async (db: mysql.Pool) => {
  await db.execute(`CREATE TABLE IF NOT EXISTS organizations (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), location VARCHAR(255), latitude DOUBLE, longitude DOUBLE, founded_year INT, description LONGTEXT, focus VARCHAR(255), is_org_public TINYINT(1) DEFAULT 0, is_species_public TINYINT(1) DEFAULT 0, obscure_location TINYINT(1) DEFAULT 1, hide_name TINYINT(1) DEFAULT 0, allow_breeding_requests TINYINT(1) DEFAULT 0, breeding_request_contact_id VARCHAR(255), show_native_status TINYINT(1) DEFAULT 1, dashboard_block JSON, enable_mfa TINYINT(1) DEFAULT 0, enable_enclosures TINYINT(1) DEFAULT 0, ai_usage_limit INT DEFAULT 100, ai_usage_count INT DEFAULT 0, ai_usage_last_reset VARCHAR(50), is_deleted TINYINT(1) DEFAULT 0)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255), email VARCHAR(255) UNIQUE, role VARCHAR(50), status VARCHAR(50), password VARCHAR(255), avatar_url LONGTEXT, allowed_project_ids JSON, preferred_language VARCHAR(10) DEFAULT 'en-GB', reset_code VARCHAR(10), reset_expires BIGINT)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS projects (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS species (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), common_name VARCHAR(255) NOT NULL, scientific_name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, plant_classification VARCHAR(50), conservation_status VARCHAR(255), sexual_maturity_age_years DOUBLE, average_adult_weight_kg DOUBLE, life_expectancy_years DOUBLE, breeding_season_start INT, breeding_season_end INT, image_url LONGTEXT, native_status_country VARCHAR(50), native_status_local VARCHAR(50))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS individuals (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), species_id VARCHAR(255), enclosure_id VARCHAR(255), studbook_id VARCHAR(255), name VARCHAR(255) NOT NULL, sex VARCHAR(20) NOT NULL, birth_date VARCHAR(50), weight_kg DOUBLE, sire_id VARCHAR(255), dam_id VARCHAR(255), image_url LONGTEXT, dna_sequence LONGTEXT, notes VARCHAR(2000), source VARCHAR(255), source_details VARCHAR(255), latitude DOUBLE, longitude DOUBLE, is_deceased TINYINT(1) DEFAULT 0, death_date VARCHAR(50), loan_status VARCHAR(50), transferred_to_org_id VARCHAR(255), transfer_date VARCHAR(50), transfer_note LONGTEXT, weight_history JSON, growth_history JSON, health_history JSON)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS enclosures (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), project_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT, boundary JSON, individual_ids JSON, feed_schedules JSON)`);
  try { await db.execute(`ALTER TABLE enclosures ADD COLUMN feed_schedules JSON`); } catch (e: any) { if (!e.message?.includes('Duplicate column')) throw e; }
  await db.execute(`CREATE TABLE IF NOT EXISTS breeding_events (id VARCHAR(255) PRIMARY KEY, species_id VARCHAR(255), sire_id VARCHAR(255), dam_id VARCHAR(255), date VARCHAR(50), offspring_count INT, successful_births INT, losses INT, notes LONGTEXT, offspring_ids JSON)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS breeding_loans (id VARCHAR(255) PRIMARY KEY, partner_org_id VARCHAR(255), proposer_org_id VARCHAR(255), role VARCHAR(50), start_date VARCHAR(50), end_date VARCHAR(50), status VARCHAR(50), individual_ids JSON, terms LONGTEXT, notification_recipient_id VARCHAR(255), change_request JSON)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS partnerships (id VARCHAR(255) PRIMARY KEY, org_id_1 VARCHAR(255), org_id_2 VARCHAR(255), status VARCHAR(50), established_date VARCHAR(50))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS app_config (id VARCHAR(255) PRIMARY KEY, settings JSON)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS languages (code VARCHAR(10) PRIMARY KEY, name VARCHAR(255), translations JSON, is_default TINYINT(1) DEFAULT 0, manual_overrides JSON, is_deleted TINYINT(1) DEFAULT 0)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS verification_codes (email VARCHAR(255) PRIMARY KEY, code VARCHAR(10) NOT NULL, expires_at BIGINT NOT NULL)`);
};

const seedDatabase = async (db: mysql.Pool, orgName?: string, adminPassword?: string) => {
  const [orgs]: any = await db.execute(`SELECT id FROM organizations LIMIT 1`);
  if (orgs.length === 0) {
    console.log('[DATABASE] Seeding initial data...');
    const name = orgName || 'My Organisation';
    const hashed = await bcrypt.hash(adminPassword || 'password', 10);
    await db.execute(`INSERT INTO organizations (id, name, location, focus, is_org_public, is_species_public, obscure_location, enable_enclosures) VALUES ('org-1', ?, '', 'Fauna', 1, 1, 0, 0)`, [name]);
    await db.execute(`INSERT INTO users (id, org_id, name, email, role, status, password) VALUES ('u-admin', 'org-1', 'Administrator', 'admin@openstudbook.local', 'Super Admin', 'Active', ?)`, [hashed]);
    await db.execute(`INSERT INTO projects (id, org_id, name, description) VALUES ('p-1', 'org-1', 'Default Project', 'Main collection')`);
    await db.execute(`INSERT INTO app_config (id, settings) VALUES ('global-settings', ?)`, [JSON.stringify({ enableRegistration: true, themePrimaryColor: '#059669' })]);
    await db.execute(`INSERT INTO languages (code, name, is_default, translations) VALUES ('en-GB', 'English (UK)', 1, ?)`, [JSON.stringify({})]);
    await db.execute(`INSERT INTO languages (code, name, is_default, translations) VALUES ('en-US', 'English (US)', 0, ?)`, [JSON.stringify({})]);
    await db.execute('INSERT INTO languages (code, name, is_default, translations) VALUES (?, ?, 0, ?)', ["id", "Bahasa Indonesia", "{\"dashboard\":\"Dasbor\",\"networkMap\":\"Jaringan\",\"plantMap\":\"Peta Flora\",\"species\":\"Spesies\",\"individuals\":\"Individu\",\"breeding\":\"Pembiakan\",\"usersRoles\":\"Pengguna & Peran\",\"organization\":\"Organisasi\",\"superAdmin\":\"Admin Super\",\"signOut\":\"Keluar\",\"currentProject\":\"Proyek Saat Ini\",\"allProjects\":\"Semua Proyek\",\"createNewProject\":\"Buat Proyek Baru\",\"landingTitle\":\"Manajemen Pembiakan Tangkaran Open Source\",\"landingSubtitle\":\"OpenStudbook adalah platform open-source untuk kebun binatang, akuarium, dan kebun raya untuk mengelola populasi spesies dan melacak genetika.\",\"createOrg\":\"Buat Organisasi\",\"exploreDemo\":\"Jelajahi Demo\",\"demoLogin\":\"Login Demo\",\"getStarted\":\"Mulai\",\"securePrivate\":\"Aman & Pribadi\",\"securePrivateDesc\":\"Data Anda adalah milik Anda. Pilih apa yang ingin Anda bagikan.\",\"floraFauna\":\"Fauna & Flora\",\"floraFaunaDesc\":\"Manajemen terpadu untuk hewan dan tumbuhan.\",\"globalNetwork\":\"Jaringan Global\",\"globalNetworkDesc\":\"Terhubung dengan mitra di seluruh dunia.\",\"back\":\"Kembali\",\"registerOrg\":\"Daftarkan Organisasi\",\"orgName\":\"Nama Organisasi\",\"orgFocus\":\"Fokus\",\"orgFocusExplanation\":\"Memilih fokus akan mengaktifkan fitur yang paling relevan untuk organisasi Anda.\",\"faunaManagement\":\"Manajemen Fauna\",\"floraManagement\":\"Manajemen Flora\",\"cityLocation\":\"Kota / Lokasi\",\"adminDetails\":\"Detail Akun Admin\",\"yourFullName\":\"Nama Lengkap Anda\",\"workEmail\":\"Email Kerja\",\"password\":\"Kata Sandi\",\"confirmPassword\":\"Konfirmasi Kata Sandi\",\"verifyEmailAndContinue\":\"Verifikasi Email & Lanjutkan\",\"signIn\":\"Masuk\",\"welcomeBack\":\"Selamat Datang Kembali\",\"signInSubtitle\":\"Masuk ke organisasi Anda.\",\"forgotPassword\":\"Lupa Kata Sandi?\",\"needAccount\":\"Butuh akun? Daftar di sini\",\"backToLanding\":\"Kembali ke Beranda\",\"about\":\"Tentang\",\"privacyPolicy\":\"Kebijakan Privasi\",\"termsConditions\":\"Syarat & Ketentuan\",\"overview\":\"Ikhtisar\",\"welcomeBackDashboard\":\"Selamat datang kembali di dasbor organisasi Anda.\",\"totalSpecies\":\"Total Spesies\",\"totalIndividuals\":\"Total Individu\",\"endangeredSpecies\":\"Spesies Terancam\",\"activeUsers\":\"Pengguna Aktif\",\"breedingPairs\":\"Pasangan Pembiakan yang Disarankan\",\"match\":\"Kecocokan\",\"noBreeding\":\"Tidak ada rekomendasi pembiakan saat ini.\",\"popDist\":\"Distribusi Populasi\",\"consStatus\":\"Rasio Status Konservasi\",\"origin\":\"Asal Populasi\",\"ageDist\":\"Distribusi Usia & Jenis Kelamin\",\"wildCaught\":\"Tangkapan Liar\",\"captiveBred\":\"Dibesarkan di Penangkaran\",\"unknownOrigin\":\"Asal Tidak Diketahui\",\"males\":\"Jantan\",\"females\":\"Betina\",\"unknownSex\":\"Tidak Diketahui\",\"years\":\"tahun\",\"orgSettings\":\"Pengaturan Organisasi\",\"orgSettingsSubtitle\":\"Kelola detail kebun binatang atau tempat perlindungan Anda.\",\"locationName\":\"Nama Lokasi (Kota/Provinsi)\",\"geoLocation\":\"Geo-Lokasi (Peta)\",\"description\":\"Deskripsi\",\"projectManagement\":\"Manajemen Proyek\",\"projectManagementDesc\":\"Buat, edit, atau hapus proyek. Transfer spesies antar proyek.\",\"dataManagement\":\"Manajemen Data\",\"dataManagementDesc\":\"Ekspor data Anda untuk disimpan atau transfer ke sistem lain.\",\"saveChanges\":\"Simpan Perubahan\",\"saved\":\"Tersimpan!\",\"speciesDatabase\":\"Basis Data Spesies\",\"speciesSubtitle\":\"Katalog dan kelola profil biologis koleksi Anda.\",\"commonName\":\"Nama Umum\",\"commonNamePlaceholder\":\"mis. Panda Merah\",\"scientificName\":\"Nama Ilmiah\",\"scientificNamePlaceholder\":\"mis. Ailurus fulgens\",\"type\":\"Kerajaan\",\"animal\":\"Fauna\",\"plant\":\"Flora\",\"conservationStatus\":\"Status Konservasi\",\"sexualMaturity\":\"Kematangan Seksual (Tahun)\",\"lifeExpectancy\":\"Harapan Hidup (Tahun)\",\"autofill\":\"Isi Otomatis\",\"aiGenerate\":\"Ilustrasi AI\",\"cancel\":\"Batal\",\"save\":\"Simpan\",\"add\":\"Tambah\",\"searchSpecies\":\"Cari Spesies...\",\"searchIndividuals\":\"Cari Individu...\",\"indivSubtitleAnimal\":\"Lacak dan kelola individu dalam perawatan Anda.\",\"updateIndividual\":\"Perbarui Individu\",\"registerIndividual\":\"Daftarkan Individu\",\"representativeImage\":\"Gambar Representatif\",\"upload\":\"Unggah\",\"noImageProvided\":\"Tidak ada gambar\",\"saveSpecies\":\"Simpan Spesies\",\"updateSpecies\":\"Perbarui Spesies\",\"lifespan\":\"Masa Hidup\",\"maturity\":\"Kematangan\",\"noSpeciesFound\":\"Spesies tidak ditemukan\",\"adultWeight\":\"Berat Dewasa\",\"classification\":\"Klasifikasi\",\"monoecious\":\"Berumah Satu\",\"dioecious\":\"Berumah Dua\",\"maturityFlowering\":\"Kematangan / Pembungaan\",\"studbookId\":\"ID Studbook\",\"name\":\"Nama\",\"saSubtitle\":\"Manajemen dan pengawasan sistem global.\",\"security\":\"Keamanan\",\"email\":\"Email\",\"landing\":\"Beranda\",\"localisation\":\"Lokalisasi\",\"network\":\"Jaringan\",\"cacheManage\":\"Manajemen Cache Lokal\",\"createOrgBtn\":\"Buat Organisasi\",\"loginAs\":\"Masuk Sebagai\",\"hostTag\":\"Host\",\"smtpTestSuccess\":\"Uji SMTP berhasil dikirim!\",\"smtpSettings\":\"Pengaturan SMTP\",\"smtpHost\":\"Host SMTP\",\"port\":\"Port\",\"username\":\"Nama Pengguna\",\"secureConnection\":\"Koneksi Aman (SSL/TLS)\",\"saveSettings\":\"Simpan Pengaturan\",\"securitySettings\":\"Pengaturan Keamanan\",\"enableMfa\":\"Aktifkan Autentikasi Dua Faktor\",\"enableOrgMfa\":\"Wajibkan MFA Organisasi\",\"enableOrgMfaDesc\":\"Wajibkan semua anggota organisasi ini menggunakan MFA.\",\"theming\":\"Tema\",\"primaryColor\":\"Warna Utama\",\"appLogo\":\"Logo Aplikasi\",\"uploadLogo\":\"Unggah Logo\",\"customCss\":\"CSS Kustom\",\"enableRegistration\":\"Aktifkan Pendaftaran\",\"featureCards\":\"Kartu Fitur\",\"addLanguage\":\"Tambah Bahasa\",\"supportedLanguages\":\"Bahasa yang Didukung\",\"heroTitle\":\"Judul Hero\",\"heroSubtitle\":\"Subjudul Hero\",\"staticPages\":\"Halaman Statis\",\"clearCacheBtn\":\"Hapus Data Lokal\",\"allOrganizations\":\"Semua Organisasi\",\"searchName\":\"Cari berdasarkan nama...\",\"emailVerifySubject\":\"Verifikasi email Anda\",\"emailVerifyBody\":\"<p>Kode verifikasi Anda adalah: <b>{{code}}</b></p>\",\"emailInviteSubject\":\"Undangan bergabung dengan {{orgName}}\",\"emailInviteBody\":\"<p>Halo {{userName}},</p><p>Anda telah diundang bergabung dengan tim manajemen di <b>{{orgName}}</b>.</p><p>Klik tautan di bawah untuk mengkonfirmasi akun dan mengatur kata sandi:</p><p style='margin:30px 0'><a href='{{inviteUrl}}' style='display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Konfirmasi Akun Saya</a></p><p style='font-size:12px;color:#64748b'>Jika tombol tidak berfungsi, salin URL ini:<br>{{inviteUrl}}</p>\",\"emailNotifySubject\":\"Notifikasi Sistem\",\"emailNotifyBody\":\"<p>Halo,</p><p>{{message}}</p>\",\"registration\":\"Pendaftaran Pengguna\",\"mfa\":\"Autentikasi Dua Faktor\",\"invite\":\"Undangan Tim\",\"notification\":\"Peringatan Sistem\",\"teamMembers\":\"Anggota Tim\",\"teamSubtitle\":\"Kelola akses dan izin tim Anda.\",\"bulkInvite\":\"Undangan Massal\",\"inviteMember\":\"Undang Anggota\",\"csvFormatTitle\":\"Format CSV\",\"csvFormatDesc\":\"Unduh template kami untuk memastikan CSV Anda diformat dengan benar.\",\"processingBulk\":\"Memproses undangan massal...\",\"selectSpecies\":\"Pilih Spesies\",\"saveEvent\":\"Simpan Acara\",\"breedingSubtitle\":\"Lacak dan kelola pasangan pembiakan dan hasilnya.\",\"recordBreedingEvent\":\"Catat Acara\",\"newBreedingLoan\":\"Pinjaman Baru\",\"breedingEvents\":\"Acara\",\"breedingLoans\":\"Pinjaman\",\"viewTitle\":\"Filter Tampilan\",\"includePartnerOrgs\":\"Sertakan Acara Mitra\",\"onboardingWelcome\":\"Selamat Datang di OpenStudbook\",\"onboardingSettingsTask\":\"Tinjau pengaturan organisasi Anda di bawah dan klik 'Simpan Perubahan' untuk melanjutkan.\",\"onboardingSaveAndNext\":\"Simpan & Lanjutkan ke Spesies\",\"onboardingSpeciesTask\":\"Bagus! Tambahkan spesies pertama Anda untuk mulai membangun koleksi.\",\"onboardingIndivTask\":\"Terakhir, daftarkan individu untuk melacak pertumbuhan dan riwayat mereka.\",\"enablePage\":\"Aktifkan Fitur\",\"dashBlockTitle\":\"Judul Pesan Dasbor\",\"dashBlockContent\":\"Konten Pesan Dasbor\",\"customDashBlock\":\"Pengumuman Dasbor Kustom\",\"customDashBlockDesc\":\"Buat blok pengumuman yang muncul di bagian atas dasbor untuk semua pengguna.\",\"visibilityPrivacy\":\"Visibilitas & Privasi\",\"breedingLoanPolicy\":\"Kebijakan Pembiakan & Pinjaman\",\"allowBreedingRequests\":\"Izinkan Permintaan Jaringan\",\"allowBreedingRequestsDesc\":\"Izinkan organisasi mitra mengusulkan pinjaman pembiakan melalui peta jaringan.\",\"whoReceivesRequests\":\"Kontak Permintaan\",\"whoReceivesRequestsDesc\":\"Pengguna mana yang diberitahu saat permintaan pinjaman diterima?\",\"orgVisibility\":\"Daftarkan dalam Direktori\",\"orgVisibilityDesc\":\"Buat organisasi Anda terlihat di peta jaringan global.\",\"obscureLocation\":\"Samarkan Lokasi Peta\",\"obscureLocationDesc\":\"Bulatkan koordinat peta untuk mencegah pelacakan lokasi yang tepat.\",\"speciesListVisibility\":\"Daftar Spesies Publik\",\"speciesListVisibilityDesc\":\"Izinkan siapa saja di jaringan melihat spesies yang Anda kelola.\",\"noPartnersFound\":\"Tidak ada mitra ditemukan.\",\"connectNewPartner\":\"Hubungkan Mitra Baru\",\"yourInviteCode\":\"Kode Undangan Anda\",\"redeemCode\":\"Tukarkan Kode\",\"siteKey\":\"Kunci Situs\",\"secretKey\":\"Kunci Rahasia\"}"]);
    await db.execute('INSERT INTO languages (code, name, is_default, translations) VALUES (?, ?, 0, ?)', ["ms", "Bahasa Melayu", "{\"dashboard\":\"Papan Pemuka\",\"networkMap\":\"Rangkaian\",\"plantMap\":\"Peta Flora\",\"species\":\"Spesies\",\"individuals\":\"Individu\",\"breeding\":\"Pembiakan\",\"usersRoles\":\"Pengguna & Peranan\",\"organization\":\"Organisasi\",\"superAdmin\":\"Admin Super\",\"signOut\":\"Log Keluar\",\"currentProject\":\"Projek Semasa\",\"allProjects\":\"Semua Projek\",\"createNewProject\":\"Cipta Projek Baru\",\"landingTitle\":\"Pengurusan Pembiakan Tangkapan Sumber Terbuka\",\"landingSubtitle\":\"OpenStudbook ialah platform sumber terbuka untuk zoo, akuarium, dan taman botani bagi menguruskan populasi spesies dan mengesan genetik.\",\"createOrg\":\"Cipta Organisasi\",\"exploreDemo\":\"Terokai Demo\",\"demoLogin\":\"Log Masuk Demo\",\"getStarted\":\"Mulakan\",\"securePrivate\":\"Selamat & Peribadi\",\"securePrivateDesc\":\"Data anda adalah milik anda. Pilih apa yang ingin anda kongsi.\",\"floraFauna\":\"Fauna & Flora\",\"floraFaunaDesc\":\"Pengurusan bersepadu untuk haiwan dan tumbuhan.\",\"globalNetwork\":\"Rangkaian Global\",\"globalNetworkDesc\":\"Berhubung dengan rakan kongsi di seluruh dunia.\",\"back\":\"Kembali\",\"registerOrg\":\"Daftarkan Organisasi\",\"orgName\":\"Nama Organisasi\",\"orgFocus\":\"Fokus\",\"orgFocusExplanation\":\"Memilih fokus akan mengaktifkan ciri yang paling relevan untuk organisasi anda.\",\"faunaManagement\":\"Pengurusan Fauna\",\"floraManagement\":\"Pengurusan Flora\",\"cityLocation\":\"Bandar / Lokasi\",\"adminDetails\":\"Butiran Akaun Admin\",\"yourFullName\":\"Nama Penuh Anda\",\"workEmail\":\"E-mel Kerja\",\"password\":\"Kata Laluan\",\"confirmPassword\":\"Sahkan Kata Laluan\",\"verifyEmailAndContinue\":\"Sahkan E-mel & Teruskan\",\"signIn\":\"Log Masuk\",\"welcomeBack\":\"Selamat Datang Kembali\",\"signInSubtitle\":\"Log masuk ke organisasi anda.\",\"forgotPassword\":\"Lupa Kata Laluan?\",\"needAccount\":\"Perlukan akaun? Daftar di sini\",\"backToLanding\":\"Kembali ke Halaman Utama\",\"about\":\"Tentang\",\"privacyPolicy\":\"Dasar Privasi\",\"termsConditions\":\"Terma & Syarat\",\"overview\":\"Ringkasan\",\"welcomeBackDashboard\":\"Selamat datang kembali ke papan pemuka organisasi anda.\",\"totalSpecies\":\"Jumlah Spesies\",\"totalIndividuals\":\"Jumlah Individu\",\"endangeredSpecies\":\"Spesies Terancam\",\"activeUsers\":\"Pengguna Aktif\",\"breedingPairs\":\"Pasangan Pembiakan Dicadangkan\",\"match\":\"Padanan\",\"noBreeding\":\"Tiada cadangan pembiakan buat masa ini.\",\"popDist\":\"Taburan Populasi\",\"consStatus\":\"Nisbah Status Pemuliharaan\",\"origin\":\"Asal Populasi\",\"ageDist\":\"Taburan Umur & Jantina\",\"wildCaught\":\"Ditangkap Liar\",\"captiveBred\":\"Dibesarkan dalam Tangkapan\",\"unknownOrigin\":\"Asal Tidak Diketahui\",\"males\":\"Jantan\",\"females\":\"Betina\",\"unknownSex\":\"Tidak Diketahui\",\"years\":\"tahun\",\"orgSettings\":\"Tetapan Organisasi\",\"orgSettingsSubtitle\":\"Urus butiran zoo atau tempat perlindungan anda.\",\"locationName\":\"Nama Lokasi (Bandar/Negeri)\",\"geoLocation\":\"Geo-Lokasi (Peta)\",\"description\":\"Penerangan\",\"projectManagement\":\"Pengurusan Projek\",\"projectManagementDesc\":\"Cipta, edit, atau padam projek. Pindahkan spesies antara projek.\",\"dataManagement\":\"Pengurusan Data\",\"dataManagementDesc\":\"Eksport data anda untuk simpanan atau pindahkan ke sistem lain.\",\"saveChanges\":\"Simpan Perubahan\",\"saved\":\"Tersimpan!\",\"speciesDatabase\":\"Pangkalan Data Spesies\",\"speciesSubtitle\":\"Katalog dan urus profil biologi koleksi anda.\",\"commonName\":\"Nama Biasa\",\"commonNamePlaceholder\":\"cth. Panda Merah\",\"scientificName\":\"Nama Saintifik\",\"scientificNamePlaceholder\":\"cth. Ailurus fulgens\",\"type\":\"Alam\",\"animal\":\"Fauna\",\"plant\":\"Flora\",\"conservationStatus\":\"Status Pemuliharaan\",\"sexualMaturity\":\"Kematangan Seksual (Tahun)\",\"lifeExpectancy\":\"Jangka Hayat (Tahun)\",\"autofill\":\"Isi Automatik\",\"aiGenerate\":\"Ilustrasi AI\",\"cancel\":\"Batal\",\"save\":\"Simpan\",\"add\":\"Tambah\",\"searchSpecies\":\"Cari Spesies...\",\"searchIndividuals\":\"Cari Individu...\",\"indivSubtitleAnimal\":\"Jejak dan urus individu dalam jagaan anda.\",\"updateIndividual\":\"Kemaskini Individu\",\"registerIndividual\":\"Daftarkan Individu\",\"representativeImage\":\"Gambar Wakil\",\"upload\":\"Muat Naik\",\"noImageProvided\":\"Tiada gambar disediakan\",\"saveSpecies\":\"Simpan Spesies\",\"updateSpecies\":\"Kemaskini Spesies\",\"lifespan\":\"Jangka Hayat\",\"maturity\":\"Kematangan\",\"noSpeciesFound\":\"Tiada spesies dijumpai\",\"adultWeight\":\"Berat Dewasa\",\"classification\":\"Klasifikasi\",\"monoecious\":\"Monoesius\",\"dioecious\":\"Dioesius\",\"maturityFlowering\":\"Kematangan / Pembungaan\",\"studbookId\":\"ID Studbook\",\"name\":\"Nama\",\"saSubtitle\":\"Pengurusan dan pengawasan sistem global.\",\"security\":\"Keselamatan\",\"email\":\"E-mel\",\"landing\":\"Halaman Utama\",\"localisation\":\"Penyetempatan\",\"network\":\"Rangkaian\",\"cacheManage\":\"Pengurusan Cache Tempatan\",\"createOrgBtn\":\"Cipta Organisasi\",\"loginAs\":\"Log Masuk Sebagai\",\"hostTag\":\"Host\",\"smtpTestSuccess\":\"Ujian SMTP berjaya dihantar!\",\"smtpSettings\":\"Tetapan SMTP\",\"smtpHost\":\"Host SMTP\",\"port\":\"Port\",\"username\":\"Nama Pengguna\",\"secureConnection\":\"Sambungan Selamat (SSL/TLS)\",\"saveSettings\":\"Simpan Tetapan\",\"securitySettings\":\"Tetapan Keselamatan\",\"enableMfa\":\"Aktifkan Pengesahan Dua Faktor\",\"enableOrgMfa\":\"Wajibkan MFA Organisasi\",\"enableOrgMfaDesc\":\"Wajibkan semua ahli organisasi ini menggunakan MFA.\",\"theming\":\"Tema\",\"primaryColor\":\"Warna Utama\",\"appLogo\":\"Logo Aplikasi\",\"uploadLogo\":\"Muat Naik Logo\",\"customCss\":\"CSS Tersuai\",\"enableRegistration\":\"Aktifkan Pendaftaran\",\"featureCards\":\"Kad Ciri\",\"addLanguage\":\"Tambah Bahasa\",\"supportedLanguages\":\"Bahasa Disokong\",\"heroTitle\":\"Tajuk Hero\",\"heroSubtitle\":\"Subtajuk Hero\",\"staticPages\":\"Halaman Statik\",\"clearCacheBtn\":\"Buang Data Tempatan\",\"allOrganizations\":\"Semua Organisasi\",\"searchName\":\"Cari mengikut nama...\",\"emailVerifySubject\":\"Sahkan e-mel anda\",\"emailVerifyBody\":\"<p>Kod pengesahan anda ialah: <b>{{code}}</b></p>\",\"emailInviteSubject\":\"Jemputan untuk menyertai {{orgName}}\",\"emailInviteBody\":\"<p>Helo {{userName}},</p><p>Anda telah dijemput untuk menyertai pasukan pengurusan di <b>{{orgName}}</b>.</p><p>Sila klik pautan di bawah untuk mengesahkan akaun dan menetapkan kata laluan:</p><p style='margin:30px 0'><a href='{{inviteUrl}}' style='display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Sahkan Akaun Saya</a></p><p style='font-size:12px;color:#64748b'>Jika butang tidak berfungsi, salin URL ini:<br>{{inviteUrl}}</p>\",\"emailNotifySubject\":\"Pemberitahuan Sistem\",\"emailNotifyBody\":\"<p>Helo,</p><p>{{message}}</p>\",\"registration\":\"Pendaftaran Pengguna\",\"mfa\":\"Pengesahan Dua Faktor\",\"invite\":\"Jemputan Pasukan\",\"notification\":\"Amaran Sistem\",\"teamMembers\":\"Ahli Pasukan\",\"teamSubtitle\":\"Urus akses dan kebenaran pasukan anda.\",\"bulkInvite\":\"Jemputan Pukal\",\"inviteMember\":\"Jemput Ahli\",\"csvFormatTitle\":\"Format CSV\",\"csvFormatDesc\":\"Muat turun templat kami untuk memastikan CSV anda diformat dengan betul.\",\"processingBulk\":\"Memproses jemputan pukal...\",\"selectSpecies\":\"Pilih Spesies\",\"saveEvent\":\"Simpan Acara\",\"breedingSubtitle\":\"Jejak dan urus pasangan pembiakan dan hasilnya.\",\"recordBreedingEvent\":\"Rekod Acara\",\"newBreedingLoan\":\"Pinjaman Baru\",\"breedingEvents\":\"Acara\",\"breedingLoans\":\"Pinjaman\",\"viewTitle\":\"Tapis Paparan\",\"includePartnerOrgs\":\"Sertakan Acara Rakan Kongsi\",\"onboardingWelcome\":\"Selamat Datang ke OpenStudbook\",\"onboardingSettingsTask\":\"Sila semak tetapan organisasi anda di bawah dan klik 'Simpan Perubahan' untuk meneruskan.\",\"onboardingSaveAndNext\":\"Simpan & Teruskan ke Spesies\",\"onboardingSpeciesTask\":\"Bagus! Tambah spesies pertama anda untuk mula membina koleksi.\",\"onboardingIndivTask\":\"Akhir sekali, daftarkan individu untuk menjejaki pertumbuhan dan sejarah mereka.\",\"enablePage\":\"Aktifkan Ciri\",\"dashBlockTitle\":\"Tajuk Mesej Papan Pemuka\",\"dashBlockContent\":\"Kandungan Mesej Papan Pemuka\",\"customDashBlock\":\"Pengumuman Papan Pemuka Tersuai\",\"customDashBlockDesc\":\"Cipta blok pengumuman yang muncul di bahagian atas papan pemuka untuk semua pengguna.\",\"visibilityPrivacy\":\"Keterlihatan & Privasi\",\"breedingLoanPolicy\":\"Dasar Pembiakan & Pinjaman\",\"allowBreedingRequests\":\"Benarkan Permintaan Rangkaian\",\"allowBreedingRequestsDesc\":\"Benarkan organisasi rakan kongsi mencadangkan pinjaman pembiakan melalui peta rangkaian.\",\"whoReceivesRequests\":\"Kenalan Permintaan\",\"whoReceivesRequestsDesc\":\"Pengguna mana yang akan diberitahu apabila permintaan pinjaman diterima?\",\"orgVisibility\":\"Senarai dalam Direktori\",\"orgVisibilityDesc\":\"Jadikan organisasi anda kelihatan pada peta rangkaian global.\",\"obscureLocation\":\"Samarkan Lokasi Peta\",\"obscureLocationDesc\":\"Bulatkan koordinat peta untuk mencegah penjejakan lokasi tepat.\",\"speciesListVisibility\":\"Senarai Spesies Awam\",\"speciesListVisibilityDesc\":\"Benarkan sesiapa dalam rangkaian melihat spesies yang anda urus.\",\"noPartnersFound\":\"Tiada rakan kongsi dijumpai.\",\"connectNewPartner\":\"Hubungkan Rakan Kongsi Baru\",\"yourInviteCode\":\"Kod Jemputan Anda\",\"redeemCode\":\"Tebus Kod\",\"siteKey\":\"Kunci Tapak\",\"secretKey\":\"Kunci Rahsia\"}"]);
    await db.execute('INSERT INTO languages (code, name, is_default, translations) VALUES (?, ?, 0, ?)', ["pt", "Portugu├¬s", "{\"dashboard\":\"Painel\",\"networkMap\":\"Rede\",\"plantMap\":\"Mapa da Flora\",\"species\":\"Esp├®cies\",\"individuals\":\"Indiv├¡duos\",\"breeding\":\"Reprodu├º├úo\",\"usersRoles\":\"Utilizadores & Fun├º├Áes\",\"organization\":\"Organiza├º├úo\",\"superAdmin\":\"Super Admin\",\"signOut\":\"Sair\",\"currentProject\":\"Projeto Atual\",\"allProjects\":\"Todos os Projetos\",\"createNewProject\":\"Criar Novo Projeto\",\"landingTitle\":\"Gest├úo de Cria├º├úo em Cativeiro Open Source\",\"landingSubtitle\":\"OpenStudbook ├® uma plataforma open-source para jardins zool├│gicos, aqu├írios e jardins bot├ónicos gerirem popula├º├Áes de esp├®cies e rastrearem a gen├®tica.\",\"createOrg\":\"Criar Organiza├º├úo\",\"exploreDemo\":\"Explorar Demo\",\"demoLogin\":\"Entrar no Demo\",\"getStarted\":\"Come├ºar\",\"securePrivate\":\"Seguro & Privado\",\"securePrivateDesc\":\"Os seus dados s├úo seus. Escolha exatamente o que partilhar.\",\"floraFauna\":\"Fauna & Flora\",\"floraFaunaDesc\":\"Gest├úo unificada para animais e plantas.\",\"globalNetwork\":\"Rede Global\",\"globalNetworkDesc\":\"Conecte-se com parceiros em todo o mundo.\",\"back\":\"Voltar\",\"registerOrg\":\"Registar Organiza├º├úo\",\"orgName\":\"Nome da Organiza├º├úo\",\"orgFocus\":\"Foco\",\"orgFocusExplanation\":\"Selecionar o foco ir├í pr├®-ativar as funcionalidades mais relevantes para a sua organiza├º├úo.\",\"faunaManagement\":\"Gest├úo de Fauna\",\"floraManagement\":\"Gest├úo de Flora\",\"cityLocation\":\"Cidade / Localiza├º├úo\",\"adminDetails\":\"Detalhes da Conta Admin\",\"yourFullName\":\"O Seu Nome Completo\",\"workEmail\":\"E-mail de Trabalho\",\"password\":\"Palavra-passe\",\"confirmPassword\":\"Confirmar Palavra-passe\",\"verifyEmailAndContinue\":\"Verificar E-mail & Continuar\",\"signIn\":\"Entrar\",\"welcomeBack\":\"Bem-vindo de Volta\",\"signInSubtitle\":\"Entre na sua organiza├º├úo.\",\"forgotPassword\":\"Esqueceu a palavra-passe?\",\"needAccount\":\"Precisa de uma conta? Registe-se aqui\",\"backToLanding\":\"Voltar ├á P├ígina Inicial\",\"about\":\"Sobre\",\"privacyPolicy\":\"Pol├¡tica de Privacidade\",\"termsConditions\":\"Termos & Condi├º├Áes\",\"overview\":\"Vis├úo Geral\",\"welcomeBackDashboard\":\"Bem-vindo de volta ao painel da sua organiza├º├úo.\",\"totalSpecies\":\"Total de Esp├®cies\",\"totalIndividuals\":\"Total de Indiv├¡duos\",\"endangeredSpecies\":\"Esp├®cies Amea├ºadas\",\"activeUsers\":\"Utilizadores Ativos\",\"breedingPairs\":\"Pares de Reprodu├º├úo Sugeridos\",\"match\":\"Compatibilidade\",\"noBreeding\":\"Sem recomenda├º├Áes de reprodu├º├úo dispon├¡veis neste momento.\",\"popDist\":\"Distribui├º├úo da Popula├º├úo\",\"consStatus\":\"R├ício de Estado de Conserva├º├úo\",\"origin\":\"Origem da Popula├º├úo\",\"ageDist\":\"Distribui├º├úo de Idade & Sexo\",\"wildCaught\":\"Capturado na Natureza\",\"captiveBred\":\"Criado em Cativeiro\",\"unknownOrigin\":\"Origem Desconhecida\",\"males\":\"Machos\",\"females\":\"F├¬meas\",\"unknownSex\":\"Desconhecido\",\"years\":\"anos\",\"orgSettings\":\"Defini├º├Áes da Organiza├º├úo\",\"orgSettingsSubtitle\":\"Gira os detalhes do seu jardim zool├│gico ou santu├írio.\",\"locationName\":\"Nome do Local (Cidade/Estado)\",\"geoLocation\":\"Geo-Localiza├º├úo (Mapa)\",\"description\":\"Descri├º├úo\",\"projectManagement\":\"Gest├úo de Projetos\",\"projectManagementDesc\":\"Criar, editar ou eliminar projetos. Transferir esp├®cies entre projetos.\",\"dataManagement\":\"Gest├úo de Dados\",\"dataManagementDesc\":\"Exporte os seus dados para arquivo ou transfira para outro sistema.\",\"saveChanges\":\"Guardar Altera├º├Áes\",\"saved\":\"Guardado!\",\"speciesDatabase\":\"Base de Dados de Esp├®cies\",\"speciesSubtitle\":\"Catalogue e gira os perfis biol├│gicos da sua cole├º├úo.\",\"commonName\":\"Nome Comum\",\"commonNamePlaceholder\":\"ex. Panda Vermelho\",\"scientificName\":\"Nome Cient├¡fico\",\"scientificNamePlaceholder\":\"ex. Ailurus fulgens\",\"type\":\"Reino\",\"animal\":\"Fauna\",\"plant\":\"Flora\",\"conservationStatus\":\"Estado de Conserva├º├úo\",\"sexualMaturity\":\"Maturidade Sexual (Anos)\",\"lifeExpectancy\":\"Esperan├ºa de Vida (Anos)\",\"autofill\":\"Preenchimento Autom├ítico\",\"aiGenerate\":\"Ilustra├º├úo IA\",\"cancel\":\"Cancelar\",\"save\":\"Guardar\",\"add\":\"Adicionar\",\"searchSpecies\":\"Pesquisar Esp├®cies...\",\"searchIndividuals\":\"Pesquisar Indiv├¡duos...\",\"indivSubtitleAnimal\":\"Acompanhe e gira os indiv├¡duos sob os seus cuidados.\",\"updateIndividual\":\"Atualizar Indiv├¡duo\",\"registerIndividual\":\"Registar Indiv├¡duo\",\"representativeImage\":\"Imagem Representativa\",\"upload\":\"Carregar\",\"noImageProvided\":\"Sem imagem fornecida\",\"saveSpecies\":\"Guardar Esp├®cie\",\"updateSpecies\":\"Atualizar Esp├®cie\",\"lifespan\":\"Esperan├ºa de Vida\",\"maturity\":\"Maturidade\",\"noSpeciesFound\":\"Nenhuma esp├®cie encontrada\",\"adultWeight\":\"Peso Adulto\",\"classification\":\"Classifica├º├úo\",\"monoecious\":\"Mon├│ico\",\"dioecious\":\"Di├│ico\",\"maturityFlowering\":\"Maturidade / Flora├º├úo\",\"studbookId\":\"ID do Studbook\",\"name\":\"Nome\",\"saSubtitle\":\"Gest├úo e supervis├úo global do sistema.\",\"security\":\"Seguran├ºa\",\"email\":\"E-mail\",\"landing\":\"P├ígina Inicial\",\"localisation\":\"Localiza├º├úo\",\"network\":\"Rede\",\"cacheManage\":\"Gest├úo de Cache Local\",\"createOrgBtn\":\"Criar Organiza├º├úo\",\"loginAs\":\"Entrar Como\",\"hostTag\":\"Anfitri├úo\",\"smtpTestSuccess\":\"Teste SMTP enviado com sucesso!\",\"smtpSettings\":\"Defini├º├Áes SMTP\",\"smtpHost\":\"Host SMTP\",\"port\":\"Porta\",\"username\":\"Nome de Utilizador\",\"secureConnection\":\"Liga├º├úo Segura (SSL/TLS)\",\"saveSettings\":\"Guardar Defini├º├Áes\",\"securitySettings\":\"Defini├º├Áes de Seguran├ºa\",\"enableMfa\":\"Ativar Autentica├º├úo de Dois Fatores\",\"enableOrgMfa\":\"For├ºar MFA da Organiza├º├úo\",\"enableOrgMfaDesc\":\"Exigir que todos os membros desta organiza├º├úo utilizem MFA.\",\"theming\":\"Tema\",\"primaryColor\":\"Cor Principal\",\"appLogo\":\"Log├│tipo da Aplica├º├úo\",\"uploadLogo\":\"Carregar Log├│tipo\",\"customCss\":\"CSS Personalizado\",\"enableRegistration\":\"Ativar Registo\",\"featureCards\":\"Cart├Áes de Funcionalidades\",\"addLanguage\":\"Adicionar Idioma\",\"supportedLanguages\":\"Idiomas Suportados\",\"heroTitle\":\"T├¡tulo Hero\",\"heroSubtitle\":\"Subt├¡tulo Hero\",\"staticPages\":\"P├íginas Est├íticas\",\"clearCacheBtn\":\"Limpar Dados Locais\",\"allOrganizations\":\"Todas as Organiza├º├Áes\",\"searchName\":\"Pesquisar por nome...\",\"emailVerifySubject\":\"Verifique o seu e-mail\",\"emailVerifyBody\":\"<p>O seu c├│digo de verifica├º├úo ├®: <b>{{code}}</b></p>\",\"emailInviteSubject\":\"Convite para se juntar a {{orgName}}\",\"emailInviteBody\":\"<p>Ol├í {{userName}},</p><p>Foi convidado a juntar-se ├á equipa de gest├úo de <b>{{orgName}}</b>.</p><p>Clique no link abaixo para confirmar a sua conta e definir a sua palavra-passe:</p><p style='margin:30px 0'><a href='{{inviteUrl}}' style='display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Confirmar a Minha Conta</a></p><p style='font-size:12px;color:#64748b'>Se o bot├úo n├úo funcionar, copie este URL:<br>{{inviteUrl}}</p>\",\"emailNotifySubject\":\"Notifica├º├úo do Sistema\",\"emailNotifyBody\":\"<p>Ol├í,</p><p>{{message}}</p>\",\"registration\":\"Registo de Utilizador\",\"mfa\":\"Autentica├º├úo de Dois Fatores\",\"invite\":\"Convite de Equipa\",\"notification\":\"Alertas do Sistema\",\"teamMembers\":\"Membros da Equipa\",\"teamSubtitle\":\"Gira o acesso e permiss├Áes da sua equipa.\",\"bulkInvite\":\"Convite em Massa\",\"inviteMember\":\"Convidar Membro\",\"csvFormatTitle\":\"Formato CSV\",\"csvFormatDesc\":\"Descarregue o nosso modelo para garantir que o seu CSV est├í corretamente formatado.\",\"processingBulk\":\"A processar convites em massa...\",\"selectSpecies\":\"Selecionar Esp├®cie\",\"saveEvent\":\"Guardar Evento\",\"breedingSubtitle\":\"Acompanhe e gira pares de reprodu├º├úo e resultados.\",\"recordBreedingEvent\":\"Registar Evento\",\"newBreedingLoan\":\"Novo Empr├®stimo\",\"breedingEvents\":\"Eventos\",\"breedingLoans\":\"Empr├®stimos\",\"viewTitle\":\"Filtrar Vista\",\"includePartnerOrgs\":\"Incluir Eventos de Parceiros\",\"onboardingWelcome\":\"Bem-vindo ao OpenStudbook\",\"onboardingSettingsTask\":\"Reveja as defini├º├Áes da sua organiza├º├úo abaixo e clique em 'Guardar Altera├º├Áes' para continuar.\",\"onboardingSaveAndNext\":\"Guardar & Continuar para Esp├®cies\",\"onboardingSpeciesTask\":\"├ôtimo! Adicione a sua primeira esp├®cie para come├ºar a construir a sua cole├º├úo.\",\"onboardingIndivTask\":\"Por fim, registe indiv├¡duos para acompanhar o seu crescimento e hist├│rico.\",\"enablePage\":\"Ativar Funcionalidade\",\"dashBlockTitle\":\"T├¡tulo da Mensagem do Painel\",\"dashBlockContent\":\"Conte├║do da Mensagem do Painel\",\"customDashBlock\":\"An├║ncio Personalizado do Painel\",\"customDashBlockDesc\":\"Crie um bloco de an├║ncio personalizado que aparece no topo do painel para todos os utilizadores.\",\"visibilityPrivacy\":\"Visibilidade & Privacidade\",\"breedingLoanPolicy\":\"Pol├¡tica de Reprodu├º├úo & Empr├®stimo\",\"allowBreedingRequests\":\"Permitir Pedidos de Rede\",\"allowBreedingRequestsDesc\":\"Permitir que organiza├º├Áes parceiras proponham empr├®stimos de reprodu├º├úo atrav├®s do mapa de rede.\",\"whoReceivesRequests\":\"Contacto de Pedidos\",\"whoReceivesRequestsDesc\":\"Qual utilizador deve ser notificado quando um pedido de empr├®stimo ├® recebido?\",\"orgVisibility\":\"Listar no Diret├│rio\",\"orgVisibilityDesc\":\"Tornar a sua organiza├º├úo vis├¡vel no mapa de rede global.\",\"obscureLocation\":\"Ocultar Localiza├º├úo no Mapa\",\"obscureLocationDesc\":\"Arredonde as coordenadas do mapa para evitar rastreamento preciso por n├úo parceiros.\",\"speciesListVisibility\":\"Lista de Esp├®cies P├║blica\",\"speciesListVisibilityDesc\":\"Permitir que qualquer pessoa na rede veja as esp├®cies que gere.\",\"noPartnersFound\":\"Nenhum parceiro encontrado.\",\"connectNewPartner\":\"Conectar Novo Parceiro\",\"yourInviteCode\":\"O Seu C├│digo de Convite\",\"redeemCode\":\"Resgatar C├│digo\",\"siteKey\":\"Chave do Site\",\"secretKey\":\"Chave Secreta\"}"]);
    await db.execute('INSERT INTO languages (code, name, is_default, translations) VALUES (?, ?, 0, ?)', ["es", "Espa├▒ol", "{\"dashboard\":\"Panel\",\"networkMap\":\"Red\",\"plantMap\":\"Mapa de Flora\",\"species\":\"Especies\",\"individuals\":\"Individuos\",\"breeding\":\"Cr├¡a\",\"usersRoles\":\"Usuarios & Roles\",\"organization\":\"Organizaci├│n\",\"superAdmin\":\"Super Admin\",\"signOut\":\"Cerrar Sesi├│n\",\"currentProject\":\"Proyecto Actual\",\"allProjects\":\"Todos los Proyectos\",\"createNewProject\":\"Crear Nuevo Proyecto\",\"landingTitle\":\"Gesti├│n de Cr├¡a en Cautividad de C├│digo Abierto\",\"landingSubtitle\":\"OpenStudbook es una plataforma de c├│digo abierto para zool├│gicos, acuarios y jardines bot├ínicos para gestionar poblaciones de especies y rastrear la gen├®tica.\",\"createOrg\":\"Crear Organizaci├│n\",\"exploreDemo\":\"Explorar Demo\",\"demoLogin\":\"Acceder al Demo\",\"getStarted\":\"Comenzar\",\"securePrivate\":\"Seguro y Privado\",\"securePrivateDesc\":\"Sus datos son suyos. Elija exactamente qu├® compartir.\",\"floraFauna\":\"Fauna y Flora\",\"floraFaunaDesc\":\"Gesti├│n unificada para animales y plantas.\",\"globalNetwork\":\"Red Global\",\"globalNetworkDesc\":\"Con├®ctese con socios en todo el mundo.\",\"back\":\"Volver\",\"registerOrg\":\"Registrar Organizaci├│n\",\"orgName\":\"Nombre de la Organizaci├│n\",\"orgFocus\":\"Enfoque\",\"orgFocusExplanation\":\"Seleccionar el enfoque activar├í previamente las funciones m├ís relevantes para su organizaci├│n.\",\"faunaManagement\":\"Gesti├│n de Fauna\",\"floraManagement\":\"Gesti├│n de Flora\",\"cityLocation\":\"Ciudad / Ubicaci├│n\",\"adminDetails\":\"Detalles de la Cuenta Admin\",\"yourFullName\":\"Su Nombre Completo\",\"workEmail\":\"Correo de Trabajo\",\"password\":\"Contrase├▒a\",\"confirmPassword\":\"Confirmar Contrase├▒a\",\"verifyEmailAndContinue\":\"Verificar Correo y Continuar\",\"signIn\":\"Iniciar Sesi├│n\",\"welcomeBack\":\"Bienvenido de Nuevo\",\"signInSubtitle\":\"Inicie sesi├│n en su organizaci├│n.\",\"forgotPassword\":\"┬┐Olvid├│ su contrase├▒a?\",\"needAccount\":\"┬┐Necesita una cuenta? Reg├¡strese aqu├¡\",\"backToLanding\":\"Volver al Inicio\",\"about\":\"Acerca de\",\"privacyPolicy\":\"Pol├¡tica de Privacidad\",\"termsConditions\":\"T├®rminos y Condiciones\",\"overview\":\"Resumen\",\"welcomeBackDashboard\":\"Bienvenido de nuevo al panel de su organizaci├│n.\",\"totalSpecies\":\"Total de Especies\",\"totalIndividuals\":\"Total de Individuos\",\"endangeredSpecies\":\"Especies en Peligro\",\"activeUsers\":\"Usuarios Activos\",\"breedingPairs\":\"Parejas de Cr├¡a Sugeridas\",\"match\":\"Compatibilidad\",\"noBreeding\":\"No hay recomendaciones de cr├¡a disponibles en este momento.\",\"popDist\":\"Distribuci├│n de la Poblaci├│n\",\"consStatus\":\"Proporci├│n de Estado de Conservaci├│n\",\"origin\":\"Origen de la Poblaci├│n\",\"ageDist\":\"Distribuci├│n de Edad y Sexo\",\"wildCaught\":\"Capturado en Naturaleza\",\"captiveBred\":\"Criado en Cautividad\",\"unknownOrigin\":\"Origen Desconocido\",\"males\":\"Machos\",\"females\":\"Hembras\",\"unknownSex\":\"Desconocido\",\"years\":\"a├▒os\",\"orgSettings\":\"Configuraci├│n de la Organizaci├│n\",\"orgSettingsSubtitle\":\"Administre los detalles de su zool├│gico o santuario.\",\"locationName\":\"Nombre del Lugar (Ciudad/Estado)\",\"geoLocation\":\"Geo-Localizaci├│n (Mapa)\",\"description\":\"Descripci├│n\",\"projectManagement\":\"Gesti├│n de Proyectos\",\"projectManagementDesc\":\"Crear, editar o eliminar proyectos. Transferir especies entre proyectos.\",\"dataManagement\":\"Gesti├│n de Datos\",\"dataManagementDesc\":\"Exporte sus datos para resguardo o transfi├®ralos a otro sistema.\",\"saveChanges\":\"Guardar Cambios\",\"saved\":\"┬íGuardado!\",\"speciesDatabase\":\"Base de Datos de Especies\",\"speciesSubtitle\":\"Catalogue y gestione los perfiles biol├│gicos de su colecci├│n.\",\"commonName\":\"Nombre Com├║n\",\"commonNamePlaceholder\":\"ej. Panda Rojo\",\"scientificName\":\"Nombre Cient├¡fico\",\"scientificNamePlaceholder\":\"ej. Ailurus fulgens\",\"type\":\"Reino\",\"animal\":\"Fauna\",\"plant\":\"Flora\",\"conservationStatus\":\"Estado de Conservaci├│n\",\"sexualMaturity\":\"Madurez Sexual (A├▒os)\",\"lifeExpectancy\":\"Esperanza de Vida (A├▒os)\",\"autofill\":\"Autocompletar\",\"aiGenerate\":\"Ilustraci├│n IA\",\"cancel\":\"Cancelar\",\"save\":\"Guardar\",\"add\":\"A├▒adir\",\"searchSpecies\":\"Buscar Especies...\",\"searchIndividuals\":\"Buscar Individuos...\",\"indivSubtitleAnimal\":\"Rastree y gestione los individuos bajo su cuidado.\",\"updateIndividual\":\"Actualizar Individuo\",\"registerIndividual\":\"Registrar Individuo\",\"representativeImage\":\"Imagen Representativa\",\"upload\":\"Subir\",\"noImageProvided\":\"Sin imagen proporcionada\",\"saveSpecies\":\"Guardar Especie\",\"updateSpecies\":\"Actualizar Especie\",\"lifespan\":\"Esperanza de Vida\",\"maturity\":\"Madurez\",\"noSpeciesFound\":\"No se encontraron especies\",\"adultWeight\":\"Peso Adulto\",\"classification\":\"Clasificaci├│n\",\"monoecious\":\"Monoico\",\"dioecious\":\"Dioico\",\"maturityFlowering\":\"Madurez / Floraci├│n\",\"studbookId\":\"ID del Studbook\",\"name\":\"Nombre\",\"saSubtitle\":\"Gesti├│n y supervisi├│n global del sistema.\",\"security\":\"Seguridad\",\"email\":\"Correo Electr├│nico\",\"landing\":\"P├ígina de Inicio\",\"localisation\":\"Localizaci├│n\",\"network\":\"Red\",\"cacheManage\":\"Gesti├│n de Cach├® Local\",\"createOrgBtn\":\"Crear Organizaci├│n\",\"loginAs\":\"Iniciar Sesi├│n Como\",\"hostTag\":\"Anfitri├│n\",\"smtpTestSuccess\":\"┬íPrueba SMTP enviada con ├®xito!\",\"smtpSettings\":\"Configuraci├│n SMTP\",\"smtpHost\":\"Host SMTP\",\"port\":\"Puerto\",\"username\":\"Nombre de Usuario\",\"secureConnection\":\"Conexi├│n Segura (SSL/TLS)\",\"saveSettings\":\"Guardar Configuraci├│n\",\"securitySettings\":\"Configuraci├│n de Seguridad\",\"enableMfa\":\"Activar Autenticaci├│n de Dos Factores\",\"enableOrgMfa\":\"Forzar MFA de Organizaci├│n\",\"enableOrgMfaDesc\":\"Requerir que todos los miembros de esta organizaci├│n usen MFA.\",\"theming\":\"Temas\",\"primaryColor\":\"Color Principal\",\"appLogo\":\"Logo de la Aplicaci├│n\",\"uploadLogo\":\"Subir Logo\",\"customCss\":\"CSS Personalizado\",\"enableRegistration\":\"Activar Registro\",\"featureCards\":\"Tarjetas de Funciones\",\"addLanguage\":\"Agregar Idioma\",\"supportedLanguages\":\"Idiomas Admitidos\",\"heroTitle\":\"T├¡tulo Principal\",\"heroSubtitle\":\"Subt├¡tulo Principal\",\"staticPages\":\"P├íginas Est├íticas\",\"clearCacheBtn\":\"Limpiar Datos Locales\",\"allOrganizations\":\"Todas las Organizaciones\",\"searchName\":\"Buscar por nombre...\",\"emailVerifySubject\":\"Verifique su correo electr├│nico\",\"emailVerifyBody\":\"<p>Su c├│digo de verificaci├│n es: <b>{{code}}</b></p>\",\"emailInviteSubject\":\"Invitaci├│n para unirse a {{orgName}}\",\"emailInviteBody\":\"<p>Hola {{userName}},</p><p>Ha sido invitado a unirse al equipo de gesti├│n de <b>{{orgName}}</b>.</p><p>Haga clic en el enlace a continuaci├│n para confirmar su cuenta y establecer su contrase├▒a:</p><p style='margin:30px 0'><a href='{{inviteUrl}}' style='display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Confirmar Mi Cuenta</a></p><p style='font-size:12px;color:#64748b'>Si el bot├│n no funciona, copie esta URL:<br>{{inviteUrl}}</p>\",\"emailNotifySubject\":\"Notificaci├│n del Sistema\",\"emailNotifyBody\":\"<p>Hola,</p><p>{{message}}</p>\",\"registration\":\"Registro de Usuario\",\"mfa\":\"Autenticaci├│n de Dos Factores\",\"invite\":\"Invitaci├│n de Equipo\",\"notification\":\"Alertas del Sistema\",\"teamMembers\":\"Miembros del Equipo\",\"teamSubtitle\":\"Gestione el acceso y permisos de su equipo.\",\"bulkInvite\":\"Invitaci├│n Masiva\",\"inviteMember\":\"Invitar Miembro\",\"csvFormatTitle\":\"Formato CSV\",\"csvFormatDesc\":\"Descargue nuestra plantilla para asegurarse de que su CSV est├® correctamente formateado.\",\"processingBulk\":\"Procesando invitaciones masivas...\",\"selectSpecies\":\"Seleccionar Especie\",\"saveEvent\":\"Guardar Evento\",\"breedingSubtitle\":\"Rastree y gestione parejas de cr├¡a y resultados.\",\"recordBreedingEvent\":\"Registrar Evento\",\"newBreedingLoan\":\"Nuevo Pr├®stamo\",\"breedingEvents\":\"Eventos\",\"breedingLoans\":\"Pr├®stamos\",\"viewTitle\":\"Filtrar Vista\",\"includePartnerOrgs\":\"Incluir Eventos de Socios\",\"onboardingWelcome\":\"Bienvenido a OpenStudbook\",\"onboardingSettingsTask\":\"Revise la configuraci├│n de su organizaci├│n a continuaci├│n y haga clic en 'Guardar Cambios' para continuar.\",\"onboardingSaveAndNext\":\"Guardar y Continuar a Especies\",\"onboardingSpeciesTask\":\"┬íExcelente! Ahora a├▒ada su primera especie para comenzar a construir su colecci├│n.\",\"onboardingIndivTask\":\"Por ├║ltimo, registre individuos para rastrear su crecimiento e historial.\",\"enablePage\":\"Activar Funci├│n\",\"dashBlockTitle\":\"T├¡tulo del Mensaje del Panel\",\"dashBlockContent\":\"Contenido del Mensaje del Panel\",\"customDashBlock\":\"Anuncio Personalizado del Panel\",\"customDashBlockDesc\":\"Cree un bloque de anuncio personalizado que aparece en la parte superior del panel para todos los usuarios.\",\"visibilityPrivacy\":\"Visibilidad y Privacidad\",\"breedingLoanPolicy\":\"Pol├¡tica de Cr├¡a y Pr├®stamo\",\"allowBreedingRequests\":\"Permitir Solicitudes de Red\",\"allowBreedingRequestsDesc\":\"Permitir que organizaciones socias propongan pr├®stamos de cr├¡a a trav├®s del mapa de red.\",\"whoReceivesRequests\":\"Contacto de Solicitudes\",\"whoReceivesRequestsDesc\":\"┬┐Qu├® usuario debe ser notificado cuando se recibe una solicitud de pr├®stamo?\",\"orgVisibility\":\"Listar en el Directorio\",\"orgVisibilityDesc\":\"Haga visible su organizaci├│n en el mapa de red global.\",\"obscureLocation\":\"Ocultar Ubicaci├│n en el Mapa\",\"obscureLocationDesc\":\"Redondee las coordenadas del mapa para evitar el rastreo preciso por no socios.\",\"speciesListVisibility\":\"Lista de Especies P├║blica\",\"speciesListVisibilityDesc\":\"Permitir que cualquier persona en la red vea qu├® especies gestiona.\",\"noPartnersFound\":\"No se encontraron socios.\",\"connectNewPartner\":\"Conectar Nuevo Socio\",\"yourInviteCode\":\"Su C├│digo de Invitaci├│n\",\"redeemCode\":\"Canjear C├│digo\",\"siteKey\":\"Clave del Sitio\",\"secretKey\":\"Clave Secreta\"}"]);
    await db.execute('INSERT INTO languages (code, name, is_default, translations) VALUES (?, ?, 0, ?)', ["fr", "Fran├ºais", "{\"dashboard\":\"Tableau de bord\",\"networkMap\":\"R├®seau\",\"plantMap\":\"Carte de la Flore\",\"species\":\"Esp├¿ces\",\"individuals\":\"Individus\",\"breeding\":\"Reproduction\",\"usersRoles\":\"Utilisateurs & R├┤les\",\"organization\":\"Organisation\",\"superAdmin\":\"Super Admin\",\"signOut\":\"Se d├®connecter\",\"currentProject\":\"Projet actuel\",\"allProjects\":\"Tous les projets\",\"createNewProject\":\"Cr├®er un nouveau projet\",\"landingTitle\":\"Gestion de l'├®levage en captivit├® Open Source\",\"landingSubtitle\":\"OpenStudbook est une plateforme open-source pour les zoos, aquariums et jardins botaniques afin de g├®rer les populations d'esp├¿ces et suivre la g├®n├®tique.\",\"createOrg\":\"Cr├®er une organisation\",\"exploreDemo\":\"Explorer la d├®mo\",\"demoLogin\":\"Connexion d├®mo\",\"getStarted\":\"Commencer\",\"securePrivate\":\"S├®curis├® & Priv├®\",\"securePrivateDesc\":\"Vos donn├®es vous appartiennent. Choisissez exactement ce que vous partagez.\",\"floraFauna\":\"Faune & Flore\",\"floraFaunaDesc\":\"Gestion unifi├®e pour animaux et plantes.\",\"globalNetwork\":\"R├®seau mondial\",\"globalNetworkDesc\":\"Connectez-vous avec des partenaires du monde entier.\",\"back\":\"Retour\",\"registerOrg\":\"Enregistrer l'organisation\",\"orgName\":\"Nom de l'organisation\",\"orgFocus\":\"Focus\",\"orgFocusExplanation\":\"S├®lectionner le focus activera les fonctionnalit├®s les plus pertinentes pour votre organisation.\",\"faunaManagement\":\"Gestion de la faune\",\"floraManagement\":\"Gestion de la flore\",\"cityLocation\":\"Ville / Localisation\",\"adminDetails\":\"D├®tails du compte Admin\",\"yourFullName\":\"Votre nom complet\",\"workEmail\":\"E-mail professionnel\",\"password\":\"Mot de passe\",\"confirmPassword\":\"Confirmer le mot de passe\",\"verifyEmailAndContinue\":\"V├®rifier l'e-mail & Continuer\",\"signIn\":\"Se connecter\",\"welcomeBack\":\"Bienvenue\",\"signInSubtitle\":\"Connectez-vous ├á votre organisation.\",\"forgotPassword\":\"Mot de passe oubli├® ?\",\"needAccount\":\"Besoin d'un compte ? Inscrivez-vous ici\",\"backToLanding\":\"Retour ├á l'accueil\",\"about\":\"├Ç propos\",\"privacyPolicy\":\"Politique de confidentialit├®\",\"termsConditions\":\"Conditions g├®n├®rales\",\"overview\":\"Vue d'ensemble\",\"welcomeBackDashboard\":\"Bienvenue dans le tableau de bord de votre organisation.\",\"totalSpecies\":\"Total des esp├¿ces\",\"totalIndividuals\":\"Total des individus\",\"endangeredSpecies\":\"Esp├¿ces menac├®es\",\"activeUsers\":\"Utilisateurs actifs\",\"breedingPairs\":\"Couples de reproduction sugg├®r├®s\",\"match\":\"Compatibilit├®\",\"noBreeding\":\"Aucune recommandation de reproduction disponible pour le moment.\",\"popDist\":\"Distribution de la population\",\"consStatus\":\"Ratio du statut de conservation\",\"origin\":\"Origine de la population\",\"ageDist\":\"Distribution par ├óge et sexe\",\"wildCaught\":\"Captur├® dans la nature\",\"captiveBred\":\"├ëlev├® en captivit├®\",\"unknownOrigin\":\"Origine inconnue\",\"males\":\"M├óles\",\"females\":\"Femelles\",\"unknownSex\":\"Inconnu\",\"years\":\"ans\",\"orgSettings\":\"Param├¿tres de l'organisation\",\"orgSettingsSubtitle\":\"G├®rez les d├®tails de votre zoo ou sanctuaire.\",\"locationName\":\"Nom du lieu (Ville/R├®gion)\",\"geoLocation\":\"G├®o-localisation (Carte)\",\"description\":\"Description\",\"projectManagement\":\"Gestion des projets\",\"projectManagementDesc\":\"Cr├®er, modifier ou supprimer des projets. Transf├®rer des esp├¿ces entre projets.\",\"dataManagement\":\"Gestion des donn├®es\",\"dataManagementDesc\":\"Exportez vos donn├®es pour sauvegarde ou transf├®rez-les vers un autre syst├¿me.\",\"saveChanges\":\"Enregistrer les modifications\",\"saved\":\"Enregistr├® !\",\"speciesDatabase\":\"Base de donn├®es des esp├¿ces\",\"speciesSubtitle\":\"Cataloguez et g├®rez les profils biologiques de votre collection.\",\"commonName\":\"Nom commun\",\"commonNamePlaceholder\":\"ex. Panda roux\",\"scientificName\":\"Nom scientifique\",\"scientificNamePlaceholder\":\"ex. Ailurus fulgens\",\"type\":\"R├¿gne\",\"animal\":\"Faune\",\"plant\":\"Flore\",\"conservationStatus\":\"Statut de conservation\",\"sexualMaturity\":\"Maturit├® sexuelle (Ann├®es)\",\"lifeExpectancy\":\"Esp├®rance de vie (Ann├®es)\",\"autofill\":\"Remplissage automatique\",\"aiGenerate\":\"Illustration IA\",\"cancel\":\"Annuler\",\"save\":\"Enregistrer\",\"add\":\"Ajouter\",\"searchSpecies\":\"Rechercher des esp├¿ces...\",\"searchIndividuals\":\"Rechercher des individus...\",\"indivSubtitleAnimal\":\"Suivez et g├®rez les individus sous votre garde.\",\"updateIndividual\":\"Mettre ├á jour l'individu\",\"registerIndividual\":\"Enregistrer l'individu\",\"representativeImage\":\"Image repr├®sentative\",\"upload\":\"T├®l├®charger\",\"noImageProvided\":\"Aucune image fournie\",\"saveSpecies\":\"Enregistrer l'esp├¿ce\",\"updateSpecies\":\"Mettre ├á jour l'esp├¿ce\",\"lifespan\":\"Dur├®e de vie\",\"maturity\":\"Maturit├®\",\"noSpeciesFound\":\"Aucune esp├¿ce trouv├®e\",\"adultWeight\":\"Poids adulte\",\"classification\":\"Classification\",\"monoecious\":\"Mono├»que\",\"dioecious\":\"Dio├»que\",\"maturityFlowering\":\"Maturit├® / Floraison\",\"studbookId\":\"ID du Studbook\",\"name\":\"Nom\",\"saSubtitle\":\"Gestion et supervision globale du syst├¿me.\",\"security\":\"S├®curit├®\",\"email\":\"E-mail\",\"landing\":\"Page d'accueil\",\"localisation\":\"Localisation\",\"network\":\"R├®seau\",\"cacheManage\":\"Gestion du cache local\",\"createOrgBtn\":\"Cr├®er une organisation\",\"loginAs\":\"Se connecter en tant que\",\"hostTag\":\"H├┤te\",\"smtpTestSuccess\":\"Test SMTP envoy├® avec succ├¿s !\",\"smtpSettings\":\"Param├¿tres SMTP\",\"smtpHost\":\"H├┤te SMTP\",\"port\":\"Port\",\"username\":\"Nom d'utilisateur\",\"secureConnection\":\"Connexion s├®curis├®e (SSL/TLS)\",\"saveSettings\":\"Enregistrer les param├¿tres\",\"securitySettings\":\"Param├¿tres de s├®curit├®\",\"enableMfa\":\"Activer l'authentification ├á deux facteurs\",\"enableOrgMfa\":\"Forcer le MFA de l'organisation\",\"enableOrgMfaDesc\":\"Exiger que tous les membres de cette organisation utilisent le MFA.\",\"theming\":\"Th├¿me\",\"primaryColor\":\"Couleur principale\",\"appLogo\":\"Logo de l'application\",\"uploadLogo\":\"T├®l├®charger le logo\",\"customCss\":\"CSS personnalis├®\",\"enableRegistration\":\"Activer l'inscription\",\"featureCards\":\"Cartes de fonctionnalit├®s\",\"addLanguage\":\"Ajouter une langue\",\"supportedLanguages\":\"Langues prises en charge\",\"heroTitle\":\"Titre principal\",\"heroSubtitle\":\"Sous-titre principal\",\"staticPages\":\"Pages statiques\",\"clearCacheBtn\":\"Vider les donn├®es locales\",\"allOrganizations\":\"Toutes les organisations\",\"searchName\":\"Rechercher par nom...\",\"emailVerifySubject\":\"V├®rifiez votre e-mail\",\"emailVerifyBody\":\"<p>Votre code de v├®rification est : <b>{{code}}</b></p>\",\"emailInviteSubject\":\"Invitation ├á rejoindre {{orgName}}\",\"emailInviteBody\":\"<p>Bonjour {{userName}},</p><p>Vous avez ├®t├® invit├® ├á rejoindre l'├®quipe de gestion de <b>{{orgName}}</b>.</p><p>Veuillez cliquer sur le lien ci-dessous pour confirmer votre compte et d├®finir votre mot de passe :</p><p style='margin:30px 0'><a href='{{inviteUrl}}' style='display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Confirmer mon compte</a></p><p style='font-size:12px;color:#64748b'>Si le bouton ne fonctionne pas, copiez cette URL :<br>{{inviteUrl}}</p>\",\"emailNotifySubject\":\"Notification du syst├¿me\",\"emailNotifyBody\":\"<p>Bonjour,</p><p>{{message}}</p>\",\"registration\":\"Inscription de l'utilisateur\",\"mfa\":\"Authentification ├á deux facteurs\",\"invite\":\"Invitation d'├®quipe\",\"notification\":\"Alertes syst├¿me\",\"teamMembers\":\"Membres de l'├®quipe\",\"teamSubtitle\":\"G├®rez les acc├¿s et permissions de votre ├®quipe.\",\"bulkInvite\":\"Invitation en masse\",\"inviteMember\":\"Inviter un membre\",\"csvFormatTitle\":\"Format CSV\",\"csvFormatDesc\":\"T├®l├®chargez notre mod├¿le pour vous assurer que votre CSV est correctement format├®.\",\"processingBulk\":\"Traitement des invitations en masse...\",\"selectSpecies\":\"S├®lectionner une esp├¿ce\",\"saveEvent\":\"Enregistrer l'├®v├®nement\",\"breedingSubtitle\":\"Suivez et g├®rez les couples de reproduction et les r├®sultats.\",\"recordBreedingEvent\":\"Enregistrer un ├®v├®nement\",\"newBreedingLoan\":\"Nouveau pr├¬t\",\"breedingEvents\":\"├ëv├®nements\",\"breedingLoans\":\"Pr├¬ts\",\"viewTitle\":\"Filtrer la vue\",\"includePartnerOrgs\":\"Inclure les ├®v├®nements des partenaires\",\"onboardingWelcome\":\"Bienvenue sur OpenStudbook\",\"onboardingSettingsTask\":\"Veuillez v├®rifier les param├¿tres de votre organisation ci-dessous et cliquer sur 'Enregistrer les modifications' pour continuer.\",\"onboardingSaveAndNext\":\"Enregistrer et continuer vers les esp├¿ces\",\"onboardingSpeciesTask\":\"Super ! Ajoutez maintenant votre premi├¿re esp├¿ce pour commencer ├á construire votre collection.\",\"onboardingIndivTask\":\"Enfin, enregistrez des individus pour suivre leur croissance et leur historique.\",\"enablePage\":\"Activer la fonctionnalit├®\",\"dashBlockTitle\":\"Titre du message du tableau de bord\",\"dashBlockContent\":\"Contenu du message du tableau de bord\",\"customDashBlock\":\"Annonce personnalis├®e du tableau de bord\",\"customDashBlockDesc\":\"Cr├®ez un bloc d'annonce personnalis├® qui appara├«t en haut du tableau de bord pour tous les utilisateurs.\",\"visibilityPrivacy\":\"Visibilit├® & Confidentialit├®\",\"breedingLoanPolicy\":\"Politique de reproduction & pr├¬t\",\"allowBreedingRequests\":\"Autoriser les demandes r├®seau\",\"allowBreedingRequestsDesc\":\"Permettre aux organisations partenaires de proposer des pr├¬ts de reproduction via la carte r├®seau.\",\"whoReceivesRequests\":\"Contact des demandes\",\"whoReceivesRequestsDesc\":\"Quel utilisateur doit ├¬tre notifi├® lorsqu'une demande de pr├¬t est re├ºue ?\",\"orgVisibility\":\"Lister dans l'annuaire\",\"orgVisibilityDesc\":\"Rendre votre organisation visible sur la carte r├®seau mondiale.\",\"obscureLocation\":\"Masquer la localisation sur la carte\",\"obscureLocationDesc\":\"Arrondissez vos coordonn├®es de carte pour ├®viter le suivi pr├®cis par les non-partenaires.\",\"speciesListVisibility\":\"Liste d'esp├¿ces publique\",\"speciesListVisibilityDesc\":\"Permettre ├á quiconque sur le r├®seau de voir les esp├¿ces que vous g├®rez.\",\"noPartnersFound\":\"Aucun partenaire trouv├®.\",\"connectNewPartner\":\"Connecter un nouveau partenaire\",\"yourInviteCode\":\"Votre code d'invitation\",\"redeemCode\":\"├ëchanger le code\",\"siteKey\":\"Cl├® du site\",\"secretKey\":\"Cl├® secr├¿te\"}"]);
  }
};

const initDatabase = async () => {
    console.log('[DATABASE] Connecting...');
    try {
        const db = getDb();
        const connection = await db.getConnection();
        connection.release();
        
        await runMigrations(db);
        await seedDatabase(db);
        isConfigured = true;
        console.log('[DATABASE] Connection successful.');
    } catch (e: any) { 
        console.error("[DATABASE] Connection Failed:", e.message);
        isConfigured = false;
    }
};

const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (e) { return res.status(401).json({ error: "Session expired" }); }
};

// --- Installer Endpoints ---

app.get('/api/install/status', async (req: any, res: any) => {
  try {
    const db = getDb();
    const connection = await db.getConnection();
    connection.release();
    const [rows]: any = await db.execute(`SHOW TABLES LIKE 'organizations'`);
    res.json({ success: true, installed: rows.length > 0, connected: true });
  } catch (e: any) {
    res.json({ success: true, installed: false, connected: false, error: e.message });
  }
});

app.post('/api/install/setup', async (req: any, res: any) => {
  const { host, user, password, database, port, orgName, adminPassword } = req.body;
  try {
    const testConn = await mysql.createConnection({ host, user, password, port: Number(port) || 3306 });
    await testConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    await testConn.end();
    resetPool({ host, user, password, database, port: Number(port) || 3306 });
    const db = getDb();
    await runMigrations(db);
    await seedDatabase(db, orgName, adminPassword);
    isConfigured = true;
    res.json({ success: true, message: "Installation successful!" });
  } catch (e: any) {
    res.status(500).json({ error: `Installation failed: ${e.message}` });
  }
});

// --- AI Proxy Endpoints ---

app.post('/api/ai/species-data', authenticate, async (req: any, res: any) => {
  const { commonName, type, locationContext } = req.body;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Provide biological data for "${commonName}" (Kingdom: ${type === 'Animal' ? 'Fauna' : 'Flora'}). Org location: ${locationContext}. Return ONLY JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: speciesSchema,
      },
    });
    if (response.text) {
      const sanitized = sanitizeJsonResponse(response.text);
      res.json(JSON.parse(sanitized));
    } else {
      res.status(500).json({ error: "AI returned empty response" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/generate-image', authenticate, async (req: any, res: any) => {
  const { prompt } = req.body;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts: [{ text: prompt }] }
    });
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            return res.json({ imageUrl: `data:image/png;base64,${part.inlineData.data}` });
          }
        }
      }
    }
    res.status(404).json({ error: "No image generated" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/translate', authenticate, async (req: any, res: any) => {
  const { sourceData, targetLanguage } = req.body;
  try {
    const payload = Object.entries(sourceData).map(([k, v]) => ({ k, v }));
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const prompt = `Translate interface strings into "${targetLanguage}": ${JSON.stringify(payload)}`;
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: translationSchema
      }
    });
    if (response.text) {
      const sanitized = sanitizeJsonResponse(response.text);
      res.json(JSON.parse(sanitized));
    } else {
      res.json([]);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/reverse-geocode', authenticate, async (req: any, res: any) => {
  const { lat, lng } = req.body;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: `Identify location at: Lat ${lat}, Lng ${lng}. Return ONLY "City, Country".`,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    res.json({ location: response.text?.trim() || "Unknown Location" });
  } catch (e: any) {
    res.json({ location: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }
});

const wrapEmailHtml = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
    .wrapper { background-color: #f8fafc; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
    .header { background-color: #059669; padding: 32px; text-align: center; }
    .logo-text { color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; text-decoration: none; }
    .content { padding: 40px; color: #334155; line-height: 1.6; font-size: 16px; }
    .footer { background-color: #f1f5f9; padding: 24px; text-align: center; color: #64748b; font-size: 12px; }
    hr { border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header"><div class="logo-text">OpenStudbook</div></div>
      <div class="content">${content}</div>
      <div class="footer"><p>&copy; ${new Date().getFullYear()} OpenStudbook Project. This is an automated message.</p></div>
    </div>
  </div>
</body>
</html>
`;

// Maps email template keys to their i18n translation keys
const EMAIL_TRANSLATION_KEYS: Record<string, { subject: string; body: string }> = {
    invite:        { subject: 'emailInviteSubject',  body: 'emailInviteBody'  },
    registration:  { subject: 'emailVerifySubject',  body: 'emailVerifyBody'  },
    mfa:           { subject: 'emailVerifySubject',  body: 'emailVerifyBody'  },
    notification:  { subject: 'emailNotifySubject',  body: 'emailNotifyBody'  },
    password_reset:{ subject: 'emailVerifySubject',  body: 'emailVerifyBody'  },
    removal:       { subject: 'emailNotifySubject',  body: 'emailNotifyBody'  },
};

const sendMailInternal = async (to: string, subject: string, html: string, placeholders: Record<string, string> = {}, templateKey?: string, language?: string) => {
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        let settings = rows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);

        if (!settings.smtpHost) {
            console.warn("[MAIL] SMTP not configured. Skipping send.");
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: Number(settings.smtpPort) || 587,
            secure: !!settings.smtpSecure,
            ...(settings.smtpUser?.trim() ? { auth: { user: settings.smtpUser, pass: settings.smtpPass } } : {})
        });

        let finalSubject = subject;
        let finalHtml = html;

        // Start with the stored English template (if any)
        if (templateKey && settings.emailTemplates && settings.emailTemplates[templateKey]) {
            const tpl = settings.emailTemplates[templateKey];
            if (tpl.enabled && tpl.subject && tpl.bodyHtml) {
                finalSubject = tpl.subject;
                finalHtml = tpl.bodyHtml;
            }
        }

        // Override with translated strings if a non-English language is requested
        if (language && language !== 'en' && language !== 'en-GB' && templateKey && EMAIL_TRANSLATION_KEYS[templateKey]) {
            try {
                const langCode = language.split('-')[0]; // e.g. 'fr-FR' → 'fr'
                const [langRows]: any = await db.execute(
                    `SELECT translations, manual_overrides FROM languages WHERE (code = ? OR code = ?) AND is_deleted = 0 LIMIT 1`,
                    [language, langCode]
                );
                if (langRows.length > 0) {
                    const rawTrans = langRows[0].translations || {};
                    const rawOverrides = langRows[0].manual_overrides || {};
                    const translations = typeof rawTrans === 'string' ? JSON.parse(rawTrans) : rawTrans;
                    const overrides = typeof rawOverrides === 'string' ? JSON.parse(rawOverrides) : rawOverrides;
                    const merged = { ...translations, ...overrides };
                    const keys = EMAIL_TRANSLATION_KEYS[templateKey];
                    if (merged[keys.subject]) finalSubject = merged[keys.subject];
                    if (merged[keys.body])    finalHtml    = merged[keys.body];
                    console.log(`[MAIL] Using ${language} translations for ${templateKey} email.`);
                }
            } catch (translationErr) {
                console.warn("[MAIL] Could not load language translations, falling back to English:", translationErr);
            }
        }

        Object.entries(placeholders).forEach(([key, val]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            finalSubject = finalSubject.replace(regex, val);
            finalHtml = finalHtml.replace(regex, val);
        });

        const fromAddress = 'admin@openstudbook.org';
        const fromHeader = `"Open Studbook" <${fromAddress}>`;

        await transporter.sendMail({
            from: fromHeader,
            to,
            subject: finalSubject,
            html: wrapEmailHtml(finalHtml)
        });
        
        console.log(`[MAIL] Email successfully sent to ${to}`);
        return true;
    } catch (e) {
        console.error("[MAIL] Error sending email:", e);
        throw e;
    }
};

// --- Endpoints ---

app.get('/api/config', async (req: any, res: any) => {
    try {
        const db = getDb();
        const [configRows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        const [langRows]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
        let settings = configRows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);
        res.json({ success: true, data: { settings, languages: langRows } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/demo-login', async (req: any, res: any) => {
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT * FROM users WHERE email = 'admin@openstudbook.local'`);
        const user = rows[0];
        if (!user) return res.status(404).json({ error: "Demo user not found. Database might be initializing." });
        
        const token = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [user.org_id]);
        
        res.json({ 
            success: true, token, 
            user: { ...user, orgId: user.org_id, avatarUrl: user.avatar_url, allowedProjectIds: typeof user.allowed_project_ids === 'string' ? JSON.parse(user.allowed_project_ids) : (user.allowed_project_ids || []) }, 
            organization: orgRows[0] 
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register/send-code', async (req: any, res: any) => {
    const { email, orgName, language } = req.body;
    try {
        const db = getDb();
        const cleanEmail = email.toLowerCase().trim();
        const [rows]: any = await db.execute(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
        if (rows.length > 0) return res.status(400).json({ error: "Email already in use." });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + (15 * 60 * 1000);

        await db.execute(
            `INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = ?, expires_at = ?`,
            [cleanEmail, code, expires, code, expires]
        );

        console.log(`[EMAIL LOG] Verification code for ${cleanEmail}: ${code}`);
        
        await sendMailInternal(cleanEmail, "Verify your email - OpenStudbook", `<p>Please use the code below for <strong>{{orgName}}</strong>:</p><div style="padding: 20px; background: #f0fdf4; border: 2px dashed #059669; border-radius: 8px; text-align: center; font-family: monospace; font-size: 32px; font-weight: bold; color: #065f46;">{{code}}</div>`, {
            code, orgName: orgName || "your organization"
        }, 'registration', language || 'en-GB');

        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req: any, res: any) => {
    const { orgName, userName, email, password, location, focus, latitude, longitude, code } = req.body;
    try {
        const db = getDb();
        const cleanEmail = email.toLowerCase().trim();

        const [codes]: any = await db.execute(`SELECT * FROM verification_codes WHERE email = ? AND code = ?`, [cleanEmail, code]);
        if (codes.length === 0) return res.status(400).json({ error: "Invalid code." });
        if (codes[0].expires_at < Date.now()) return res.status(400).json({ error: "Code expired." });

        const orgId = `org-${Date.now()}`;
        const userId = `u-${Date.now()}`;
        const hashedPassword = await bcrypt.hash(password, 10);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute(
                `INSERT INTO organizations (id, name, location, focus, is_org_public, latitude, longitude, obscure_location) VALUES (?, ?, ?, ?, 1, ?, ?, 1)`,
                [orgId, orgName, location || '', focus || 'Fauna', latitude || null, longitude || null]
            );
            await conn.execute(
                `INSERT INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, ?, ?, 'Admin', 'Active', ?)`,
                [userId, orgId, userName, cleanEmail, hashedPassword]
            );
            await conn.execute(`DELETE FROM verification_codes WHERE email = ?`, [cleanEmail]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        const token = jwt.sign({ id: userId, orgId, role: 'Admin' }, JWT_SECRET, { expiresIn: '7d' });
        const [userRows]: any = await db.execute(`SELECT * FROM users WHERE id = ?`, [userId]);
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [orgId]);

        res.json({ 
            success: true, token, 
            user: { ...userRows[0], orgId: userRows[0].org_id, avatarUrl: userRows[0].avatar_url, allowedProjectIds: [] },
            organization: orgRows[0]
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: "Invalid credentials" });
        const isValid = await bcrypt.compare(password, user.password || '').catch(() => false);
        if (!isValid) return res.status(401).json({ error: "Invalid credentials" });
        
        const token = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? AND is_deleted = 0`, [user.org_id]);
        
        res.json({ 
            success: true, token, 
            user: { ...user, orgId: user.org_id, avatarUrl: user.avatar_url, allowedProjectIds: typeof user.allowed_project_ids === 'string' ? JSON.parse(user.allowed_project_ids) : (user.allowed_project_ids || []) }, 
            organization: orgRows[0] 
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sync', authenticate, async (req: any, res: any) => {
    const orgId = req.user.orgId;
    const role = req.user.role;
    const isSuper = role === 'Super Admin';
    try {
        const db = getDb();
        let orgRows: any = [], partnersRows: any = [], projectsRows: any = [], usersRows: any = [], speciesRows: any = [], individualsRows: any = [], languagesRows: any = [], configRows: any = [], enclosuresRows: any = [];

        if (isSuper) {
            const [o]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? AND is_deleted = 0`, [orgId]);
            orgRows = o;
            const [p]: any = await db.execute(`SELECT * FROM organizations WHERE id != ? AND is_deleted = 0`, [orgId]);
            partnersRows = p;
            const [pj]: any = await db.execute(`SELECT * FROM projects`);
            projectsRows = pj;
            const [u]: any = await db.execute(`SELECT id, org_id, name, email, role, status, avatar_url, allowed_project_ids FROM users`);
            usersRows = u;
            const [s]: any = await db.execute(`SELECT * FROM species`);
            speciesRows = s;
            const [i]: any = await db.execute(`SELECT * FROM individuals`);
            individualsRows = i;
            const [enc]: any = await db.execute(`SELECT * FROM enclosures`);
            enclosuresRows = enc;
        } else {
            const [o]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? AND is_deleted = 0`, [orgId]);
            orgRows = o;
            const [p]: any = await db.execute(`SELECT * FROM organizations WHERE id != ? AND is_org_public = 1 AND is_deleted = 0`, [orgId]);
            partnersRows = p;
            const [pj]: any = await db.execute(`SELECT * FROM projects WHERE org_id = ?`, [orgId]);
            projectsRows = pj;
            const [u]: any = await db.execute(`SELECT id, org_id, name, email, role, status, avatar_url, allowed_project_ids FROM users WHERE org_id = ?`, [orgId]);
            usersRows = u;
            const [s]: any = await db.execute(`SELECT s.* FROM species s JOIN projects p ON s.project_id = p.id WHERE p.org_id = ?`, [orgId]);
            speciesRows = s;
            const [i]: any = await db.execute(`SELECT i.* FROM individuals i JOIN projects p ON i.project_id = p.id WHERE p.org_id = ?`, [orgId]);
            individualsRows = i;
            const [enc]: any = await db.execute(`SELECT * FROM enclosures WHERE org_id = ?`, [orgId]);
            enclosuresRows = enc;
        }
        
        const [l]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
        languagesRows = l;
        const [conf]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        configRows = conf;

        let settings = configRows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);

        res.json({ 
            success: true, 
            data: { 
                org: orgRows[0] || null, 
                partners: partnersRows || [], 
                projects: projectsRows || [], 
                users: usersRows || [], 
                species: speciesRows || [], 
                individuals: individualsRows || [], 
                enclosures: enclosuresRows || [],
                languages: languagesRows || [], 
                settings 
            } 
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/proxy-image', authenticate, async (req: any, res: any) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });
    try {
        // Convert Google Drive share URLs → direct download URL
        let fetchUrl = url.trim();
        const gdFile = fetchUrl.match(/\/file\/d\/([^\/\?&]+)/);
        const gdOpen = fetchUrl.match(/[?&]id=([^&]+)/);
        if (gdFile) {
            fetchUrl = `https://drive.google.com/uc?export=download&id=${gdFile[1]}`;
        } else if (gdOpen && fetchUrl.includes('drive.google.com')) {
            fetchUrl = `https://drive.google.com/uc?export=download&id=${gdOpen[1]}`;
        }

        const response = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenStudbook/1.0)' },
            redirect: 'follow',
        });
        if (!response.ok) return res.status(502).json({ error: `Remote fetch failed: ${response.status}` });

        const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        if (!contentType.startsWith('image/')) return res.status(415).json({ error: `URL did not return an image (got ${contentType})` });

        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        res.json({ success: true, base64, mimeType: contentType });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/invite/check', async (req: any, res: any) => {
    const { token } = req.query;
    try {
        const db = getDb();
        const [rows]: any = await db.execute(
            `SELECT u.id, u.name, u.email, u.status, o.name as org_name FROM users u JOIN organizations o ON u.org_id = o.id WHERE u.id = ?`,
            [token]
        );
        const user = rows[0];
        if (!user) return res.status(404).json({ error: "Invalid or expired invitation." });
        if (user.status !== 'Invited') return res.status(400).json({ error: "This invitation has already been used." });
        res.json({ success: true, data: { name: user.name, email: user.email, orgName: user.org_name } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invite/accept', async (req: any, res: any) => {
    const { token, password } = req.body;
    try {
        const db = getDb();
        const [rows]: any = await db.execute(
            `SELECT u.*, o.name as org_name FROM users u JOIN organizations o ON u.org_id = o.id WHERE u.id = ?`,
            [token]
        );
        const user = rows[0];
        if (!user) return res.status(404).json({ error: "Invalid or expired invitation." });
        if (user.status !== 'Invited') return res.status(400).json({ error: "Invitation already used." });
        const hashed = await bcrypt.hash(password, 10);
        await db.execute(`UPDATE users SET password = ?, status = 'Active' WHERE id = ?`, [hashed, token]);
        const jwtToken = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? AND is_deleted = 0`, [user.org_id]);
        res.json({
            success: true, token: jwtToken,
            user: { id: user.id, orgId: user.org_id, name: user.name, email: user.email, role: user.role, status: 'Active', allowedProjectIds: typeof user.allowed_project_ids === 'string' ? JSON.parse(user.allowed_project_ids || '[]') : (user.allowed_project_ids || []) },
            organization: orgRows[0]
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
    const { to, subject, html, placeholders, templateKey, language } = req.body;
    try {
        await sendMailInternal(to, subject, html, placeholders, templateKey, language);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/test', authenticate, async (req: any, res: any) => {
    const { to } = req.body;
    try {
        const success = await sendMailInternal(to, "SMTP Connectivity Test", "<p>This is a test email to verify your SMTP settings are correct.</p>");
        if (success) res.json({ success: true, message: "Test email sent successfully!" });
        else res.status(400).json({ error: "SMTP configured but failed to send. Check logs." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const body = req.body;
    const data = Array.isArray(body) ? body : [body];
    
    if (data.length === 0) return res.json({ success: true });

    try {
        const db = getDb();
        for (const item of data) {
            const keys = Object.keys(item);
            const values = Object.values(item).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
            
            const placeholders = keys.map(() => '?').join(', ');
            const updates = keys.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
            
            const sql = `INSERT INTO \`${table}\` (\`${keys.join('`, `')}\`) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
            await db.execute(sql, values);
        }
        res.json({ success: true });
    } catch (e: any) { 
        console.error(`[REST POST] Error on table ${table}:`, e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const { id } = req.query;
    try {
        const db = getDb();
        let sql = `SELECT * FROM \`${table}\``;
        const params = [];
        if (id) {
           sql += ` WHERE id = ?`;
           params.push(id);
        }
        const [rows]: any = await db.execute(sql, params);
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing id" });
    
    try {
        const db = getDb();
        if (table === 'organizations') {
            const conn = await db.getConnection();
            try {
               await conn.beginTransaction();
               await conn.execute(`DELETE FROM individuals WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [id]);
               await conn.execute(`DELETE FROM species WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [id]);
               await conn.execute(`DELETE FROM projects WHERE org_id = ?`, [id]);
               await conn.execute(`DELETE FROM enclosures WHERE org_id = ?`, [id]);
               await conn.execute(`DELETE FROM users WHERE org_id = ?`, [id]);
               await conn.execute(`DELETE FROM breeding_loans WHERE proposer_org_id = ? OR partner_org_id = ?`, [id, id]);
               await conn.execute(`DELETE FROM partnerships WHERE org_id_1 = ? OR org_id_2 = ?`, [id, id]);
               await conn.execute(`DELETE FROM organizations WHERE id = ?`, [id]);
               await conn.commit();
            } catch (err) {
               await conn.rollback();
               throw err;
            } finally { conn.release(); }
        } else {
            await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
        }
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/')) return res.status(404).json({ error: "404" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { await initDatabase(); app.listen(PORT, () => console.log(`Backend listening on ${PORT}`)); })();
