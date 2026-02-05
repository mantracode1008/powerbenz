# How to Deploy ScrapSys for a Client

This guide explains how to package and deliver the ScrapSys application to a client so they can run it on their own computer.

## Prerequisites

The client's computer must have **Node.js** installed.
- Download Link: [https://nodejs.org/](https://nodejs.org/) (LTS Version is recommended)

## Step 1: Build the Frontend

First, we need to create a production-ready version of the website (frontend).

1. Open your terminal in the `web` folder.
2. Run the build command:
   ```bash
   cd web
   npm run build
   ```
   This will create a `dist` folder inside the `web` directory. This folder contains the optimized website files.

## Step 2: Prepare the Server

The server is already configured to serve the website from the `dist` folder we just created.

## Step 3: Package the Application

To give the application to the client, you need to zip the necessary files.

1. Create a new folder named `ScrapSys_App`.
2. Copy the `server` folder into `ScrapSys_App`.
3. Copy the `web` folder into `ScrapSys_App`.
   - **Important:** You only strictly need the `web/dist` folder, but keeping the structure `web/dist` is easier because the server looks for `../web/dist`.
   - So, inside `ScrapSys_App`, you should have:
     - `server/` (with all its files, including `database.sqlite`)
     - `web/` (containing the `dist` folder)

**To save space (Optional but Recommended):**
- You can delete the `node_modules` folder inside `server` before zipping. The client will install them.
- You can delete the `node_modules` folder inside `web`. It's not needed for running the app, only for building (which we already did).

## Step 4: Instructions for the Client

Create a text file named `INSTRUCTIONS.txt` inside the `ScrapSys_App` folder with the following content:

```text
=== How to Run ScrapSys ===

1. Install Node.js:
   - If you haven't already, download and install Node.js from https://nodejs.org/

2. Setup (First Time Only):
   - Open the "server" folder.
   - Right-click in an empty space and select "Open in Terminal" (or Command Prompt).
   - Type the following command and press Enter:
     npm install

3. Start the Application:
   - Inside the "server" folder, open the Terminal again.
   - Type the following command and press Enter:
     npm start

4. Open in Browser:
   - Open Google Chrome or Edge.
   - Go to: http://localhost:5001

The application is now running!
```

## Step 5: Deliver to Client

1. Zip the `ScrapSys_App` folder.
2. Send the zip file to the client.
