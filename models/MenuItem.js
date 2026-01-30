// models/MenuItem.js

// Import mongoose
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the menu item schema (structure of menu item data)
const menuItemSchema = new Schema({

    // Item name (required)
    name: { type: String, required: true },

    // Item description (optional)
    description: { type: String },

    // Item image (path or URL, optional)
    image: { type: String }, // Assuming image path or URL

    // Item quantity (default = 0, required)
    quantity: { type: Number, default: 0, required: true },

    // Item price (required)
    price: { type: Number, required: true },
});

// Export the MenuItem model (represents "menuitems" collection in MongoDB)
module.exports = mongoose.model('MenuItem', menuItemSchema);

