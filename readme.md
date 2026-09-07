# 🌾 FarmDirect

Direct Farmer-to-Consumer & Bulk Marketplace with AI-powered Demand Forecasting and Delivery Route Optimization.

## Features
- **Public Marketplace**: Search by crop, farmer name, or location. Filter by crop type and sort by price or recency.
- **Farmer Portal**: List fresh crops, track incoming orders, accept/reject or advance order delivery status, and view total earnings (100% direct payment, 0% middlemen commission).
- **Buyer Cart & Checkout**: Add items to cart with live stock check, select delivery type (home consumer or bulk), and view real-time savings compared to wholesale mandi prices.
- **AI Demand Forecasting**: Weighted moving average and seasonal index predictions for crops based on sales history.
- **Delivery Route Optimizer**: Nearest-neighbor + 2-opt heuristic delivery routing minimizing fuel cost and carbon emissions.
- **Authentication**: Salted scrypt password hashing and session tokens.

## Getting Started

### 1. Run the Database Seed
Populates demo farmer and buyer accounts, initial marketplace inventory, and 12-month sales data:
```bash
node seed.js
```

**Demo Logins (Password: `farm123`)**:
- **Farmer**: Phone `9876500001` (Ramesh Patil - Shetkari FPO)
- **Buyer**: Phone `9000000000` (Demo Buyer)

### 2. Start the Server
```bash
node server.js
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
