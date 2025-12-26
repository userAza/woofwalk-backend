# WoofWalk Backend

Backend API for the WoofWalk dog walking platform.

## Technologies Used

- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **MySQL** - Database
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Nodemailer** - Email functionality for password reset

## Prerequisites

- Node.js installed
- MySQL server running
- XAMPP (for phpMyAdmin and MySQL)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with:
```env
PORT=3000
JWT_SECRET=your_secret_key

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=woofwalk

EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

3. Import the database:
   - Open phpMyAdmin
   - Create database named `woofwalk`
   - Import the SQL schema

4. Start the server:
```bash
npm start
```

Server will run on http://localhost:3000

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/change-password` - Change password (authenticated)

### Users
- `GET /api/users/profile` - Get user profile
- `PATCH /api/users/profile` - Update user profile

### Walkers
- `GET /api/walkers` - Get all walkers
- `GET /api/walkers/search` - Search walkers by filters
- `GET /api/walkers/:id` - Get walker details

### Bookings
- `GET /api/bookings` - Get user's bookings
- `POST /api/bookings` - Create new booking
- `PATCH /api/bookings/:id/cancel` - Cancel booking

### Dogs
- `GET /api/dogs` - Get user's dogs
- `POST /api/dogs` - Add new dog
- `DELETE /api/dogs/:id` - Delete dog

### Reviews
- `GET /api/reviews/walker/:id` - Get walker reviews
- `POST /api/reviews` - Create review

### Vets
- `GET /api/vets` - Get all vets
- `GET /api/vets/search` - Search vets by city

### Admin
- `POST /api/admin/login` - Admin login
- `GET /api/admin/users` - Get all users
- `PATCH /api/admin/users/:id/ban` - Ban/unban user
- `GET /api/admin/walkers` - Get all walkers
- `PATCH /api/admin/walkers/:id/ban` - Ban/unban walker

## Database Schema

Main tables:
- `users` - User accounts
- `walkers` - Dog walker profiles
- `dogs` - User's dogs
- `bookings` - Walk bookings
- `reviews` - Walker reviews
- `vets` - Veterinary clinics
- `user_subscriptions` - Loyalty program (20% discount after 10 walks)

## Features

- User authentication with JWT
- Password reset via email
- Booking system with multiple dogs and add-ons
- Review and rating system
- Automatic subscription after 10 completed walks
- Admin dashboard for user/walker management
- Vet finder with city search