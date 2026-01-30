const mongoose = require('mongoose');

// Define Schema (structure of item data)
const itemSchema = new mongoose.Schema({
    // Item name
    name: String,

    // Item description
    description: String,

    // Item image (path or URL)
    image: String,

    // Quantity available
    quantity: Number,

    // Item price
    price: Number,

    // State of item (default = "online")
    state: { type: String, default: 'online' },

    // Customer phone number
    customerPhone: String,

    // Month when the item was created (set automatically by middleware)
    month: Number,

    // Table number (default = 0, for non-dine-in orders)
    tableNumber: { type: Number, default: 0 },

    // Date and time when item was created
    createdAt: { type: Date, default: Date.now },

    // Payment status (false = not paid, true = paid)
    paid: { type: Boolean, default: false },

    // Order ID (string, can be UUID)
    orderId: { type: String }, // Add UUID field

    // Item location
    location: String,

    // Server ID (default = "nan" if not assigned)
    serverID: { type: String, default: 'nan' },
});

// Middleware to set the month automatically before saving
itemSchema.pre('save', function (next) {
    const now = new Date();
    this.month = now.getMonth() + 1; // getMonth() returns 0-11, so add 1
    next();
});

// Create Model (represents "items" collection in MongoDB)
const Item = mongoose.model('Item', itemSchema);

// Export the model so it can be used in other files
module.exports = Item;

