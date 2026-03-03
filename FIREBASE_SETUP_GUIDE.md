# 🔥 Multiplayer Firebase Setup Guide

To enable real-time multiplayer scheduling for free, this application has been connected to **Firebase Realtime Database**. 

When configured, if you drag a shift or add a person, your teammates will instantly see it on their screens without refreshing!

---

## 🚀 Step 1: Create a Free Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or create project).
   - Enter a name (e.g., "Wayne Duty Roster").
   - You **do not** need Google Analytics.
   - Wait for the project to finish creating.
3. Once in the project dashboard, look at the left sidebar or the "Build" menu and click **Realtime Database**.
4. Click **Create Database**.
   - Choose a location closest to you (e.g., Singapore `asia-southeast1`). 
   - Start in **Test mode** (we can secure it later).
   - Click **Enable**.

## 🔑 Step 2: Get Your Config Variables

1. Go back to your Firebase Project Overview (click the home icon top-left).
2. Click the **Web** icon (`</>`) in the center to add a web app.
3. Give it a nickname (e.g., "Web App") and click **Register app**.
   - You *don't* need to check Firebase Hosting just yet.
4. Firebase will show you a block of code with a `firebaseConfig` object looking like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyXYZ123...",
     authDomain: "your-project.firebaseapp.com",
     databaseURL: "https://your-project.firebaseio.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:12345:web:abcdef..."
   };
   ```

## 💻 Step 3: Add to Your `.env.local` File

Open the `.env.local` file in the root folder of your project on your computer. Add the keys from Step 2 so it looks exactly like this:

```env
# Gemini API Key (Optional)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# Firebase Realtime Database Config (For Multiplayer)
VITE_FIREBASE_API_KEY=AIzaSyXYZ123...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:12345:web:abcdef...
```

**Restart your development server** (`Preview App.bat` or `npm run dev`) and you're good to go!
If you open `http://localhost:3000` in two different browser windows, you will see edits update magically on both screens.

---

## 🔒 Step 4: Secure Data & Free Tier Info

### What's The Free Limit?
Firebase Realtime Database gives you **1 GB of storage** and **10 GB/month data download** on the free Spark plan. Since shifts and names are just tiny text strings, this is virtually unlimited for this app! 

You will likely **never** hit this limit.

### Security Rules
Since you started in "Test Mode", anyone who finds your database URL could edit it. You can secure it under "Realtime Database" -> "Rules" tab:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
*(For a public team roster, leaving it public is the easiest way to ensure all collaborators can edit without making them create passwords/logins. Just don't share the URL with strangers!)*
