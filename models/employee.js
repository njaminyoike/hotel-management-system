// Import mongoose
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define employee schema (structure of employee data)
const employeeSchema = new Schema({
    
    // Employee name
    name: {
        type: String,
        required: true
    },

    // Employee phone number
    phone: {
        type: String,
        required: true
    },

    // Employee work ID
    workID: {
        type: String,
        required: true
    },

    // Employee role (e.g., manager, driver, etc.)
    role: {
        type: String,
        required: true
    },

    // Employee password
    password: {
        type: String,
        required: true
    },
});

// Create Employee model (represents "employees" collection in MongoDB)
const Employee = mongoose.model('Employee', employeeSchema);

// Export the model so it can be used in other files
module.exports = Employee;

