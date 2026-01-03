import { getSystemSettings } from './storage';

// API Configuration
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const API_BASE_URL = isLocal ? 'http://localhost:3001' : '';

/**
 * Sends a system email by communicating with the backend.
 * Uses template key to let the backend pull from the DB.
 */
export const sendSystemEmail = async (
  to: string, 
  templateType: 'mfa' | 'invite' | 'notification' | 'registration', 
  placeholders: Record<string, string>,
  fallbackSubject: string,
  fallbackBody: string
) => {
  console.log(`[EMAIL SERVICE] Attempting to dispatch ${templateType} email to ${to}...`);
  // Use session token for auth
  const token = localStorage.getItem('os_token');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token.replace(/"/g, '')}` : ''
      },
      body: JSON.stringify({
        to,
        templateKey: templateType,
        placeholders,
        // Optional raw fields if template key fails on backend
        subject: fallbackSubject,
        html: fallbackBody
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Email delivery failed");
    }
    return true;
  } catch (e) {
    console.error("Email Service Error:", e);
    return false;
  }
};

export const testSmtpConnection = async (testEmail: string) => {
  const token = localStorage.getItem('os_token');
  if (!token) throw new Error("Not authenticated");

  const response = await fetch(`${API_BASE_URL}/api/email/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token.replace(/"/g, '')}`
    },
    body: JSON.stringify({ to: testEmail })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Connection test failed");
  return data;
};