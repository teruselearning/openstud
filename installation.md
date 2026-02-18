# OpenStudbook Installation Guide

OpenStudbook is a self-hosted conservation management platform. This guide will walk you through setting up the Node.js backend and the React frontend.

## 1. Prerequisites

*   **Node.js**: Version 18.x or higher.
*   **MySQL Server**: A running instance (local or remote).
*   **Gemini API Key**: Required for AI biological research and image generation. Get it from [Google AI Studio](https://aistudio.google.com/).

---

## 2. Backend Setup (Proxy & API)

The backend now handles all AI requests to keep your API key secure.

1.  **Navigate to the backend directory**:
    ```bash
    cd backend
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment**:
    Create a `.env` file in the `backend/` folder:
    ```env
    PORT=3001
    JWT_SECRET=your_long_random_secure_string
    API_KEY=your_gemini_api_key_here
    ```
    *Note: You do not need to provide database credentials here yet; the web installer will handle the connection configuration.*

4.  **Start the backend**:
    ```bash
    npm run dev
    ```
    The server will start on `http://localhost:3001`.

---

## 3. Frontend Setup

1.  **Navigate to the project root**:
    ```bash
    cd ..
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Start the development server**:
    ```bash
    npm run dev
    ```
    The app will typically be available at `http://localhost:3000`.

---

## 4. Web-Based System Configuration

When you first launch the application in your browser, you will see the **System Installer**.

1.  **Step 1: Welcome**: Review the prerequisites and click "Start Setup".
2.  **Step 2: Database Config**: Enter your MySQL details:
    *   **Hostname**: (e.g., `localhost`)
    *   **Port**: (e.g., `3306`)
    *   **User**: (e.g., `root`)
    *   **Password**: Your MySQL password.
    *   **Database Name**: `openstudbook` (The installer will create this if it's missing).
3.  **Step 3: Install**: Click "Connect & Install".
    *   The system will automatically create all SQL tables.
    *   Default languages (UK/US English) will be seeded.
    *   A default Super Admin account will be created.

---

## 5. Getting Started

Once the installer finishes, you will be redirected to the landing page.

### Default Administrator Credentials:
*   **Email**: `sarah@wild.org`
*   **Password**: `password`

### Recommended First Steps:
1.  Log in as the administrator.
2.  Go to **Organization Settings** to set your location and focus (Fauna or Flora).
3.  Go to **Species** and use the "Autofill" feature to quickly catalog your collection.
4.  Go to **Super Admin > Localisation** to add support for additional languages using AI translation.

## Production Notes

*   **Security**: Ensure your `JWT_SECRET` is unique and long.
*   **HTTPS**: Geolocation and camera features require an HTTPS connection in production.
*   **SMTP**: To enable email invitations, configure your SMTP settings in the **Super Admin > Email** tab after logging in.
