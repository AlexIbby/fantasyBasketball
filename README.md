# Fantasy Basketball Analytics

A comprehensive web application for analyzing Yahoo Fantasy Basketball league performance, providing detailed insights into team strengths, statistical trends, and trade opportunities.

## Features

### 📊 Category Strengths Analysis
- Compare your team's performance against every other team in your league for any given week
- Identify statistical categories where your team excels or underperforms
- View detailed rankings across all fantasy categories (points, rebounds, assists, steals, blocks, 3-pointers, field goal %, free throw %, turnovers, and double-doubles)
- Smart analysis highlighting your team's strongest and weakest statistical areas

### 🔄 Team Comparisons
- Compare season totals or weekly averages for all teams in your league
- Switch between different viewing perspectives (your team vs. all others)
- Responsive design with both table and card views for optimal viewing on any device
- Real-time ranking calculations for competitive insights

### 📈 Statistical Trends
- Visualize how your team's performance has evolved throughout the season
- Interactive charts showing week-by-week statistical progression
- Customizable views for any statistical category tracked in your league
- Historical performance analysis to identify improvement opportunities

### 👥 Player Contributions
- Analyze individual player contributions to your team's overall statistics
- Compare weekly vs. season-long player performance
- Detailed breakdown of how each player impacts your team's success
- Visual charts for easy performance comparison

### 🔄 Advanced Trade Analyzer
- **Smart Trade Evaluation**: Analyze potential trades with comprehensive impact assessment
- **NBA Player Integration**: Search and add real NBA players using live statistical data
- **Ranking Context**: Understand how trades affect your team's league standings
- **Strategic Insights**: Get recommendations based on your team's current strengths and weaknesses
- **Detailed Impact Analysis**: See exactly how each statistical category would be affected
- **Visual Trade Summary**: Enhanced interface showing trade implications at a glance

## Technology Stack

- **Backend**: Python Flask with session-based authentication
- **Frontend**: Vanilla JavaScript with Chart.js for data visualization
- **APIs**: 
  - Yahoo Fantasy Sports API for league data
  - NBA API for real player statistics
- **Styling**: Custom CSS with responsive design
- **Deployment**: Configured for Heroku with Gunicorn

## Local Development Setup

### Prerequisites

1. **Yahoo Developer Account**: Create an application at [Yahoo Developer Network](https://developer.yahoo.com/)
   - Select "Fantasy Sports" API access
   - Choose "Read" permissions for basic functionality
   - Note your Client ID and Client Secret

2. **ngrok**: Required for local OAuth callback handling
   - Install from [ngrok.com](https://ngrok.com/)
   - Used to create secure tunnels to your localhost

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/AlexIbby/fantasyBasketball.git
   cd fantasyBasketball
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the project root:
   ```env
   YAHOO_CLIENT_ID=your_yahoo_client_id
   YAHOO_CLIENT_SECRET=your_yahoo_client_secret
   FLASK_SECRET_KEY=your_secret_key_for_sessions
   FLASK_ENV=development
   ```

4. **Configure ngrok**
   ```bash
   # Start ngrok in a separate terminal
   ngrok http 5000
   ```
   
   Copy the HTTPS URL provided by ngrok (e.g., `https://abc123.ngrok.io`)

5. **Update Yahoo App Settings**
   - In your Yahoo Developer application settings
   - Set the Redirect URI to: `https://your-ngrok-url.ngrok.io/callback`

6. **Run the application**
   ```bash
   python main.py
   ```

7. **Access the application**
   - Open your ngrok URL in a browser
   - Log in with your Yahoo account
   - Select your fantasy basketball league

### Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `YAHOO_CLIENT_ID` | Your Yahoo app's Client ID | Yes |
| `YAHOO_CLIENT_SECRET` | Your Yahoo app's Client Secret | Yes |
| `FLASK_SECRET_KEY` | Secret key for Flask sessions | Yes |
| `FLASK_ENV` | Set to `development` for local development | No |

## Usage

1. **Authentication**: Log in with your Yahoo Fantasy Sports account
2. **League Selection**: Choose from your available fantasy basketball leagues
3. **Dashboard Navigation**: Use the tab interface to access different features:
   - **Category Strengths**: Weekly team comparisons
   - **Compare Teams**: Season-long analysis
   - **Trends**: Historical performance tracking
   - **Trade Analyzer**: Evaluate potential trades

### Trade Analyzer Guide

1. **Add Players**: Search for NBA players using the search boxes
2. **Build Trade**: Add players to "Trading Away" and "Acquiring" sides
3. **Evaluate**: Click "Evaluate Trade" for comprehensive analysis
4. **Review Results**: Examine statistical impact, ranking changes, and strategic insights

## API Endpoints

The application provides several API endpoints for accessing fantasy and NBA data:

- `/api/scoreboard` - Weekly matchup data
- `/api/season_avg` - Season-long team statistics
- `/api/league_settings` - League configuration and categories
- `/api/nba_players` - Current NBA player roster
- `/api/nba_player_stats/<player_id>` - Individual player statistics

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

For questions or support, please [open an issue](https://github.com/AlexIbby/fantasyBasketball/issues) on GitHub.

---

Built for H2H Basketball fantasy basketball enthusiasts
