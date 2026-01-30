// Import mongoose
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define customer schema (structure of customer data)
const customerSchema = new Schema({
    
    // Customer name
    name: {
        type: String,
        required: true
    },

    // Customer phone number
    phone: {
        type: String,
        required: true
    },
    
    // Customer password
    password: {
        type: String,
        required: true
    },
});

// Create model from schema (represents "customers" collection in MongoDB)
const Customer = mongoose.model('Customer', customerSchema);

// Export the model so it can be used in other files
module.exports = Customer;

