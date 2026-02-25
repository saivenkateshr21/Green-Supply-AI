# Hosting & Deployment Guide - GreenSupply AI

This project is now ready for deployment using Docker. Below are the steps to host it on popular platforms.

## Pre-requisites
1.  **Firebase Console**: Ensure **Google** and **Email/Password** are enabled in the Authentication tab.
2.  **Authorized Domains**: Add your production domain (e.g., `greensupply-ai.onrender.com`) to the Firebase Authorized Domains list.

---

## 🚀 Option 1: Render.com (Recommended)
Render is the easiest way to host this full-stack application.

1.  **Push to GitHub**: Initialize a git repo and push your code.
2.  **Create New Web Service**:
    *   Connect your GitHub repository.
    *   **Runtime**: `Docker`.
    *   **Port**: `8000`.
3.  **Environment Variables**:
    *   Add `GROK_API_KEY`, `OLLAMA_URL` (if using remote Ollama), etc.
    *   Note: For Ollama, you'd typically need a separate service or use a cloud LLM like Grok/Gemini for hosting.

---

## 🐋 Option 2: Docker Deployment (General VPS)
If you have a VPS (DigitalOcean, AWS, etc.):

1.  **Clone the Repo**:
    ```bash
    git clone <your-repo-url>
    cd GreenSupply-AI
    ```
2.  **Prepare .env**: Create `backend/.env` with your production keys.
3.  **Run with Docker Compose**:
    ```bash
    docker-compose up -d --build
    ```

---

## ☁️ Option 3: Firebase Hosting (Frontend Only)
While the backend handles the frontend right now, you can host the frontend separately on Firebase for better performance:
1.  Install Firebase CLI: `npm install -g firebase-tools`
2.  Initialize: `firebase init hosting`
3.  Set public directory to `frontend`.
4.  Deploy: `firebase deploy --only hosting`
*(Note: You will still need the backend running elsewhere for WebSockets and AI).*

---

### Important Notes on AI for Hosting:
- **Ollama**: Local Ollama won't work on cloud hosts like Render without complex tunneling. I recommend relying on **Grok** or **Gemini** for the hosted version unless you have a GPU-enabled VPS.
