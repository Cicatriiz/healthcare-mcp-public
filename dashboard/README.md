# FDA Drug Shortage Intelligence Dashboard - Frontend

A comprehensive web-based dashboard for tracking FDA drug shortages with clinical context and analytics.

## Features

- **Real-time Shortage Tracking**: Search and filter current FDA drug shortages
- **Advanced Filtering**: By status, therapeutic category, dosage form, manufacturer
- **Clinical Context**: Automatic enrichment with PubMed articles, health guidelines, clinical trials
- **Analytics & Visualizations**: Aggregate statistics and trend analysis
- **Geographic Distribution**: Map shortages by manufacturer location
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Dashboard API server running (see `../server/dashboard-server.js`)

### Running the Dashboard

1. **Start the Dashboard API Server** (from parent directory):
   ```bash
   cd ../server
   npm install
   npm run dashboard
   ```

   The API server will start on `http://localhost:3001`

2. **Serve the Frontend**:

   The dashboard server automatically serves static files from `./public`:
   ```bash
   # Static files served at: http://localhost:3001/
   ```

   Or use any static file server:
   ```bash
   cd dashboard/public
   npx serve .
   # Or use Python:
   python3 -m http.server 8080
   ```

3. **Access the Dashboard**:
   - Main Dashboard: `http://localhost:3001/` or `http://localhost:8080/`
   - About Page: `http://localhost:3001/about.html`

## Project Structure

```
dashboard/
├── public/
│   ├── index.html          # Main shortage list view
│   ├── about.html          # About & methodology page
│   ├── css/
│   │   └── styles.css      # Custom styles
│   └── js/
│       ├── api-client.js   # API communication layer
│       └── app.js          # Main application logic
└── README.md
```

## Configuration

### API Endpoint

The frontend automatically detects the API endpoint:
- **Development** (localhost): `http://localhost:3001/api/dashboard`
- **Production**: `/api/dashboard` (assumes reverse proxy)

To customize, edit `js/api-client.js`:
```javascript
const API_BASE_URL = 'https://your-api-domain.com/api/dashboard';
```

## Features Detail

### Shortage List (index.html)
- Search by drug name or NDC
- Multi-select filtering
- Pagination (10/20/50/100 per page)
- Sortable columns
- Status badges (Active/Resolved)
- Click to view details

### Future Pages (To be implemented)
- **detail.html**: Detailed shortage view with enrichment tabs
- **analytics.html**: Charts and visualizations
- **map.html**: Interactive geographic map

## Technology Stack

- **Frontend Framework**: Vanilla JavaScript (ES6+)
- **CSS Framework**: Tailwind CSS (via CDN)
- **HTTP Client**: Fetch API
- **Icons**: Unicode symbols (no dependencies)

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

## Development

### File Watching
Use browser auto-reload extensions or:
```bash
npx live-server public/
```

### Debugging
Open browser DevTools Console to see API calls and responses.

## API Documentation

See API documentation at: `http://localhost:3001/api/dashboard`

## License

MIT

## Links

- [GitHub Repository](https://github.com/Jerempire/healthcare-mcp-public)
- [openFDA Drug Shortages API](https://open.fda.gov/apis/drug/drugshortages/)
