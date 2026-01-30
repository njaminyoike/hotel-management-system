// Import mongoose
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the meal schema (structure of meal data)
const mealSchema = new Schema({
    
    // Meal name (required)
    name: {
        type: String,
        required: true
    },

    // Meal description (required)
    description: {
        type: String,
        required: true
    },

    // Meal image (URL or file path, required)
    image: {
        type: String,
        required: true
    },

    // Meal quantity (required)
    quantity: {
        type: Number,
        required: true
    },

    // Meal price (required)
    price: { 
        type: Number, 
        required: true 
    },
});

// Create the Meal model (represents "meals" collection in MongoDB)
const Meal = mongoose.model('Meal', mealSchema);

// Export the model so it can be used in other files
module.exports = Meal;

