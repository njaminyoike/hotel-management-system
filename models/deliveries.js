// Import mongoose
const mongoose = require("mongoose");

// Define Delivery model with schema
const Delivery = mongoose.model("Delivery", new mongoose.Schema({

    // Unique delivery code (random 4-digit number)
    code: {
        type: Number,
        default: () => Math.floor(1000 + Math.random() * 9000) 
    },

    // Related order ID
    orderId: String,

    // Driver assigned to the delivery
    driver: String,

    // Delivery status (false = not delivered, true = delivered)
    status: {
        type: Boolean,
        default: false
    },

    // Estimated time of arrival (random between 5–60 minutes)
    ETA: {
        type: Number,
        default: () => Math.floor(5 + Math.random() * 56)
    }, 

    // Current delivery location
    location: String,

    // Customer phone number
    phone: String
}));

// Export the model so it can be used in other files
module.exports = Delivery;

