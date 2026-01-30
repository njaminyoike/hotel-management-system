// models/orderHistory.js

// Import mongoose
const mongoose = require('mongoose');

// Define order history schema (structure of past orders)
const orderHistorySchema = new mongoose.Schema({
    
    // Date and time when order was confirmed
    confirmedAt: {
        type: Date,
        required: true
    },

    // Customer name
    customerName: {
        type: String,
        required: true
    },

    // List of food items ordered (array of strings)
    foodOrdered: {
        type: [String], // Example: ["Pizza", "Burger", "Juice"]
        required: true
    },

    // Total amount paid for the order
    totalAmount: {
        type: Number,
        required: true
    },

    // Payment method (e.g., "Cash", "Card", "M-Pesa")
    paymentMethod: {
        type: String,
        required: true
    }
});

// Create OrderHistory model (represents "orderhistories" collection in MongoDB)
const OrderHistory = mongoose.model('OrderHistory', orderHistorySchema);

// Export the model so it can be used in other files
module.exports = OrderHistory;

