# Cliff — AI Assistant Website

A static website for cliffcircuit.ai, built with HTML and Tailwind CSS.

## About This Project

This is the public-facing website for Cliff, an AI assistant running on OpenClaw. The site showcases what Cliff does, how the interaction works, and tells the origin story.

## Local Development

To view the site locally, simply open `index.html` in your browser:

```bash
# macOS
open index.html

# Or navigate to the file in your browser
# file:///path/to/your/project/index.html
```

No build step or server required — this is a static HTML site.

## Deployment to GitHub Pages

### Step 1: Create Repository

1. Go to https://github.com/new
2. Name it `cliffcircuit-ai` (or your preferred name)
3. Make it public
4. Click "Create repository"

### Step 2: Push Code

```bash
# Initialize git (if not already done)
git init

# Add the remote
git remote add origin https://github.com/CliffCircuit/cliffcircuit-ai.git

# Add all files
git add .

# Commit
git commit -m "Initial commit: Complete site with hero, services, how-it-works, about, and footer"

# Push to main branch
git push -u origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages** (in the left sidebar)
3. Under "Source", select **Deploy from a branch**
4. Select **main** branch and `/(root)` folder
5. Click **Save**

### Step 4: Add Custom Domain

1. In the Pages settings, under "Custom domain", enter: `cliffcircuit.ai`
2. Click Save
3. GitHub will verify the DNS settings
4. Enable "Enforce HTTPS" once the certificate is issued (takes a few minutes)

### Step 5: Add CNAME File

Create a `CNAME` file in your repository with:

```
cliffcircuit.ai
```

Push it to the repository:

```bash
echo "cliffcircuit.ai" > CNAME
git add CNAME
git commit -m "Add CNAME for custom domain"
git push
```

## DNS Configuration

Your domain DNS is already configured at Namecheap:

| Type | Host | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | CliffCircuit.github.io |

These are GitHub Pages IPs. Once both GitHub Pages and DNS are configured, the site will be live at https://cliffcircuit.ai

## Site Structure

- **Hero Section** — Introduction and personality
- **What I Do** — Four service cards (Research, Build, Automate, Organize)
- **How It Works** — Three-step process overview
- **About** — Origin story and technical background
- **Footer** — Social links and tagline

## Meta Tags

The site includes:
- Standard meta description
- Open Graph tags (Facebook, LinkedIn)
- Twitter Card meta tags
- Responsive viewport settings

## Files

| File | Description |
|------|-------------|
| `index.html` | Main website file |
| `README.md` | This file |
| `PRD.md` | Product Requirements Document |

## Customization

The site uses Tailwind CSS via CDN. To customize:

1. Edit `index.html` directly
2. Use Tailwind utility classes (see https://tailwindcss.com/docs)
3. No build step required

## Support

For issues or updates, reach out on X: [@cliffcircuit](https://x.com/cliffcircuit)
