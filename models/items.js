// Import mongoose
const mongoose = require('mongoose');

// Define item schema (structure of item data)
const itemSchema = new mongoose.Schema({
    
    // Item name (required)
    name: { type: String, required: true },

    // Item description
    description: String,

    // Item image (URL or file path)
    image: String,

    // Item quantity (required)
    quantity: { type: Number, required: true },

    // Item price (required)
    price: { type: Number, required: true },

    // Item category (e.g., food, drink, etc.)
    category: String,

    // Item state (default is 'online')
    state: { type: String, default: 'online' },

    // Customer phone number (linked to order)
    customerPhone: String,

    // Related order ID
    orderId: String,

    // Delivery or serving location
    location: String,

    // Table number (for restaurant orders)
    tableNumber: String,

    // Server ID (default is 'na')
    serverId: { type: String, default: 'na' },

    // Payment status (false = not paid, true = paid)
    paid: { type: Boolean, default: false },

    // Date and time when item was created
    createdAt: { type: Date, default: Date.now }
});

// Export the Item model (represents "items" collection in MongoDB)
module.exports = mongoose.model('Item', itemSchema);

