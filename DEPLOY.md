# Deployment Guide - FDA Drug Shortage Dashboard

## Deploy to Render.com (FREE) - 5 Minutes

This guide will help you deploy the dashboard to Render.com's free tier so you can access it from anywhere, including work computers with IT restrictions.

### Prerequisites
- GitHub account (free)
- Render.com account (free - no credit card required)

---

## Step 1: Push Code to GitHub

If you haven't already pushed your code to GitHub:

```bash
# Make sure you're on the right branch
git checkout claude/fda-shortage-dashboard-Ql6rJ

# Push to GitHub
git push origin claude/fda-shortage-dashboard-Ql6rJ
```

---

## Step 2: Sign Up for Render.com

1. Go to https://render.com
2. Click "Get Started"
3. Sign up with your GitHub account (easiest option)
4. Authorize Render to access your repositories

---

## Step 3: Deploy the Dashboard

### Option A: Automatic Deployment (Recommended)

1. **In Render Dashboard**, click "New +" → "Web Service"

2. **Connect Repository**:
   - Find your `healthcare-mcp-public` repository
   - Click "Connect"

3. **Configure Service**:
   - **Name**: `fda-shortage-dashboard` (or any name you like)
   - **Branch**: `claude/fda-shortage-dashboard-Ql6rJ`
   - **Root Directory**: Leave blank
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run server:http`

4. **Select Free Plan**:
   - Choose "Free" instance type
   - Click "Create Web Service"

5. **Wait for Deployment** (2-3 minutes):
   - Render will automatically build and deploy
   - You'll see logs in real-time
   - When done, you'll see "Live" status

6. **Get Your URL**:
   - Copy the URL (looks like: `https://fda-shortage-dashboard.onrender.com`)
   - Open it in your browser
   - Share with your boss!

### Option B: Use Blueprint (Even Easier)

The repository includes a `render.yaml` file for one-click deployment:

1. **In Render Dashboard**, click "New +" → "Blueprint"
2. **Connect Repository**: Select `healthcare-mcp-public`
3. **Branch**: `claude/fda-shortage-dashboard-Ql6rJ`
4. Click "Apply" - Everything is pre-configured!

---

## Step 4: Access from Work Computer

Your dashboard is now live at: `https://your-app-name.onrender.com`

**You can access it from:**
- ✅ Work computer (bypasses all IT restrictions - it's just a website!)
- ✅ Your boss's computer
- ✅ Your phone
- ✅ Any device with internet

Just share the URL!

---

## Important Notes

### Free Tier Limitations

**Sleep Mode**: The free tier "sleeps" after 15 minutes of inactivity.
- First load after sleep takes ~30-60 seconds to wake up
- After that, it's instant
- This is perfect for demos!

**Workaround** (if needed for a meeting):
- Visit the URL 1-2 minutes before your meeting
- It will stay awake while you're using it

### Data Caching

- FDA data is cached for 24 hours
- First load might take 5-10 seconds to fetch from FDA API
- Subsequent loads are instant (uses cache)

---

## Troubleshooting

### Build Failed?

Check the logs in Render dashboard. Common issues:

1. **Missing dependencies**: Make sure `package.json` is in the root directory
   - Fix: Verify `npm install` runs locally

2. **Port issues**: Render automatically sets the PORT environment variable
   - The app is already configured for this

3. **Branch not found**: Make sure you pushed the correct branch
   - Run: `git push origin claude/fda-shortage-dashboard-Ql6rJ`

### App Won't Load?

1. **Check Render dashboard status**: Should show "Live" in green
2. **Check logs**: Click "Logs" in Render dashboard
3. **Try accessing**: `/health` endpoint first: `https://your-app.onrender.com/health`
   - Should return: `{"status":"ok"}`

### Slow Initial Load?

This is normal for free tier:
- Free instances sleep after 15 min of inactivity
- First request wakes it up (~30-60 seconds)
- After that it's fast for as long as it's active

**For Demo**: Just load the page 1-2 minutes before your meeting!

---

## Custom Domain (Optional)

Want a custom domain like `shortage-dashboard.yourhospital.com`?

1. In Render dashboard, go to your service
2. Click "Settings" → "Custom Domain"
3. Follow instructions to add your domain

**Note**: Custom domains work on free tier!

---

## Updating the Dashboard

When you make changes:

```bash
git add .
git commit -m "Update dashboard"
git push origin claude/fda-shortage-dashboard-Ql6rJ
```

Render automatically redeploys! (takes 2-3 minutes)

---

## Alternative: Railway.app

If Render doesn't work, try Railway.app (also free):

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js and deploys!

---

## For Your Boss

Share this simple message:

```
Hi [Boss Name],

I've built a Drug Shortage Intelligence Dashboard that helps us:
- Track FDA drug shortages in real-time
- Identify root causes (manufacturing issues, demand spikes, etc.)
- Find therapeutic alternatives automatically
- Prepare for formulary integration

You can view it here: https://[your-app-name].onrender.com

Pages to check out:
1. Main Dashboard - Current shortages with filtering
2. Trends - Root cause analysis and manufacturer risks
3. Click any drug - See therapeutic alternatives automatically

Looking forward to your feedback!
```

---

## Cost

**Render.com Free Tier**: $0/month forever
- 750 hours/month free (enough for continuous uptime)
- Sleeps after 15 min inactivity
- Perfect for demos and internal tools

**Upgrade Later** (if needed): $7/month
- No sleep
- Faster resources
- Custom domains included

For now, FREE is perfect!

---

## Security Note

The dashboard only uses public FDA data - no sensitive hospital information is transmitted. Safe to access from any network.

Once you upload your hospital formulary (later), we'll add authentication if needed.

---

## Questions?

Common questions:

**Q: Can multiple people access it at once?**
A: Yes! The free tier supports multiple concurrent users.

**Q: Will it work on hospital WiFi?**
A: Yes! It's just a regular HTTPS website. No VPN or special access needed.

**Q: How long does deployment take?**
A: First time: 2-3 minutes. Updates: 2-3 minutes.

**Q: Can I take it down later?**
A: Yes! Just delete the service in Render dashboard.
