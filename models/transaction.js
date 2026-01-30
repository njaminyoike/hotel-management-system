const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define transaction schema (logs employee actions on orders)
const transactionSchema = new Schema({
    // ID of the employee who performed the action (linked to Employee model)
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },

    // Role of the employee (e.g., Manager, Waiter, Driver)
    role: { type: String, required: true },

    // Action taken (e.g., "created order", "updated order", "delivered")
    action: { type: String, required: true },

    // ID of the related order
    orderId: { type: String, required: true },

    // Date and time when the action happened (default = now)
    timestamp: { type: Date, default: Date.now }
});

// Create Transaction model (represents "transactions" collection in MongoDB)
const Transaction = mongoose.model('Transaction', transactionSchema);

// Export the model so it can be used in other files
module.exports = Transaction;

