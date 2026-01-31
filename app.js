require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const ejs = require('ejs');
const multer = require('multer');
const mongoDBSession = require('connect-mongodb-session')(session);
const { v4: uuidv4 } = require('uuid');
const Delivery = require("./models/deliveries.js");
const axios = require('axios');
const cors = require('cors');
const Transaction = require('./models/transaction');
const OrderHistory = require('./models/orderHistory');
console.log('SmartPay API Key Loaded:', process.env.SMARTPAYPESA_API_KEY ? 'YES' : 'NO');

const app = express();
const port = 3000;

app.use(cors());

const PAYPAL_CLIENT_ID = 'AUXbJ1MpXAA28xCuZbw_n-BkB6aAksDIXAES6RN_SYjE5Pp1GNwdcbpRVy9EJP6tgd2KFV80ir7_B58z';
const PAYPAL_CLIENT_SECRET = 'EPA7dro8F7FD04Er5aZGZ9y5JpnWHL_luzYmOToZtY9VNT0OMqGv_CIwRcU2skag7PDqDwQyHjI0KNOH';

// MongoDB URI string
const dbURI = 'mongodb+srv://max:h9H9mi5Gbp1IsH2t@nodejsdb.oxlzabu.mongodb.net/?retryWrites=true&w=majority&appName=NodejsDB';

console.log("MONGODB_URI from Render =", process.env.MONGODB_URI);

// Connect to MongoDB
mongoose.connect(dbURI, {})
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(port, () => {
            console.log(`Server is running at http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.error('Error connecting to MongoDB:', err);
    });

const store = new mongoDBSession({
    uri:dbURI,
    collection:'mySessions'
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.json());

// Dialogflow setup
const dialogflow = require('@google-cloud/dialogflow');
const keyFile = path.join(__dirname, 'hotelchatbot-iqty-6703049cd440.json');

const sessionClient = new dialogflow.SessionsClient({
  keyFilename: keyFile
});

const projectId = 'hotelchatbot-iqty';

// Multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'images');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(session({ 
    secret: 'secret',
    resave: false, 
    saveUninitialized: false, 
    store: store, 
    cookie: { 
        secure: false 
    } 
}));

// Serve static files
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
app.use('/pages', express.static(path.join(__dirname, 'pages')));

// Import models
const Employee = require('./models/employee.js');
const Customer = require('./models/customer.js');
const MenuItem = require('./models/MenuItem.js');
const Meal = require('./models/meal'); 
const Item = require('./models/server_items'); 

// ============ M-PESA DARAJA API INTEGRATION ============

// M-Pesa Configuration
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || 'your_consumer_key';
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || 'your_consumer_secret';
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || '174379';
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || 'your_passkey';
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || 'https://your-ngrok-url.ngrok.io/api/mpesa/callback';

const pendingPayments = new Map();

// Helper: Get M-Pesa OAuth Access Token
async function getMpesaAccessToken() {
    try {
        const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
        
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            {
                headers: { Authorization: `Basic ${auth}` }
            }
        );
        
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting M-Pesa token:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with M-Pesa');
    }
}

// Helper: Generate M-Pesa Password and Timestamp
function generateMpesaPassword() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[^0-9]/g, '')
        .slice(0, 14);
    
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');
    
    return { password, timestamp };
}

// Helper: Format Phone Number
function formatPhoneNumber(phone) {
    let formatted = phone.replace(/[\s\-+]/g, '');
    
    if (formatted.startsWith('0')) {
        formatted = '254' + formatted.substring(1);
    }
    
    if (!formatted.startsWith('254')) {
        formatted = '254' + formatted;
    }
    
    return formatted;
}

// ROUTE 1: Initiate M-Pesa STK Push Payment
app.post('/api/mpesa/initiate', async (req, res) => {
    try {
        const { orderNumber, phoneNumber } = req.body;
        
        if (!orderNumber || !phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Order number and phone number are required'
            });
        }
        
        // Find order items to get total amount
        const orderItems = await Item.find({ orderId: orderNumber });
        
        if (!orderItems || orderItems.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        
        // Calculate total amount
        const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // Get M-Pesa access token
        const accessToken = await getMpesaAccessToken();
        const { password, timestamp } = generateMpesaPassword();
        const formattedPhone = formatPhoneNumber(phoneNumber);
        
        // Prepare STK Push request
        const stkPushData = {
            BusinessShortCode: MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.round(totalAmount),
            PartyA: formattedPhone,
            PartyB: MPESA_SHORTCODE,
            PhoneNumber: formattedPhone,
            CallBackURL: MPESA_CALLBACK_URL,
            AccountReference: orderNumber,
            TransactionDesc: `Payment for order ${orderNumber}`
        };
        
        console.log('Sending STK Push request:', stkPushData);
        
        // Send STK Push request to M-Pesa
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            stkPushData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('M-Pesa Response:', response.data);
        
        // Store pending payment details
        pendingPayments.set(response.data.CheckoutRequestID, {
            orderNumber,
            phoneNumber: formattedPhone,
            amount: totalAmount,
            status: 'pending',
            timestamp: new Date()
        });
        
        res.json({
            success: true,
            message: 'Payment request sent to your phone',
            checkoutRequestID: response.data.CheckoutRequestID,
            customerMessage: response.data.CustomerMessage
        });
        
    } catch (error) {
        console.error('M-Pesa Initiate Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.errorMessage || error.message || 'Failed to initiate payment'
        });
    }
});

// ROUTE 2: M-Pesa Callback
app.post('/api/mpesa/callback', async (req, res) => {
    try {
        console.log('M-Pesa Callback Received:', JSON.stringify(req.body, null, 2));
        
        const { Body } = req.body;
        const { stkCallback } = Body;
        
        const checkoutRequestID = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;
        const resultDesc = stkCallback.ResultDesc;
        
        const paymentInfo = pendingPayments.get(checkoutRequestID);
        
        if (resultCode === 0) {
            const callbackMetadata = stkCallback.CallbackMetadata.Item;
            const mpesaReceiptNumber = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
            const amount = callbackMetadata.find(item => item.Name === 'Amount')?.Value;
            const phoneNumber = callbackMetadata.find(item => item.Name === 'PhoneNumber')?.Value;
            
            console.log(`Payment Successful! Order: ${paymentInfo?.orderNumber}, M-Pesa Ref: ${mpesaReceiptNumber}`);
            
            if (paymentInfo) {
                pendingPayments.set(checkoutRequestID, {
                    ...paymentInfo,
                    status: 'completed',
                    mpesaReceiptNumber,
                    completedAt: new Date()
                });
            }
            
            if (paymentInfo?.orderNumber) {
                await Item.updateMany(
                    { orderId: paymentInfo.orderNumber },
                    { paid: true }
                );
            }
            
            const transaction = new Transaction({
                orderId: paymentInfo?.orderNumber,
                amount: amount,
                phoneNumber: phoneNumber,
                mpesaReceiptNumber: mpesaReceiptNumber,
                paymentMethod: 'mpesa',
                status: 'completed',
                checkoutRequestID: checkoutRequestID
            });
            
            await transaction.save();
            
        } else {
            console.log(`Payment Failed! Order: ${paymentInfo?.orderNumber}, Reason: ${resultDesc}`);
            
            if (paymentInfo) {
                pendingPayments.set(checkoutRequestID, {
                    ...paymentInfo,
                    status: 'failed',
                    failureReason: resultDesc,
                    failedAt: new Date()
                });
            }
        }
        
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        
    } catch (error) {
        console.error('M-Pesa Callback Error:', error);
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
});

// ROUTE 3: Check Payment Status
app.get('/api/mpesa/status/:orderNumber', async (req, res) => {
    try {
        const { orderNumber } = req.params;
        
        let paymentStatus = 'pending';
        let mpesaReference = null;
        
        for (const [checkoutRequestID, payment] of pendingPayments.entries()) {
            if (payment.orderNumber === orderNumber) {
                paymentStatus = payment.status;
                mpesaReference = payment.mpesaReceiptNumber;
                break;
            }
        }
        
        const orderItems = await Item.find({ orderId: orderNumber, paid: true });
        if (orderItems.length > 0) {
            paymentStatus = 'completed';
        }
        
        res.json({
            orderNumber,
            paymentStatus,
            mpesaReference
        });
        
    } catch (error) {
        console.error('Status Check Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ROUTE 4: Query M-Pesa Transaction Status
app.post('/api/mpesa/query', async (req, res) => {
    try {
        const { checkoutRequestID } = req.body;
        
        const accessToken = await getMpesaAccessToken();
        const { password, timestamp } = generateMpesaPassword();
        
        const queryData = {
            BusinessShortCode: MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestID
        };
        
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
            queryData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        res.json(response.data);
        
    } catch (error) {
        console.error('Query Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============ END M-PESA INTEGRATION ============

// Inline MenuItem model
const menuItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    category: { type: String },
});

// Dialogflow Chatbot route
app.post('/chatbot', async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) return res.status(400).json({ reply: "Please send a message" });

    try {
        const sessionId = uuidv4();
        const sessionPath = sessionClient.projectAgentSessionPath(projectId, sessionId);

        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: userMessage,
                    languageCode: 'en-US',
                }
            }
        };

        const responses = await sessionClient.detectIntent(request);
        const result = responses[0].queryResult;

        if (result.intent && result.intent.displayName === "Menu") {
            try {
                const menuItems = await MenuItem.find();
                if (!menuItems.length) {
                    return res.json({ reply: "Our menu is currently empty." });
                }

                const menuText = menuItems
                    .map(item => `${item.name} - $${item.price}`)
                    .join('\n');

                return res.json({ reply: `Here is our menu:\n${menuText}` });
            } catch (err) {
                console.error('Error fetching menu:', err);
                return res.json({ reply: "Error fetching menu." });
            }
        }

        res.json({ reply: result.fulfillmentText || "I didn't understand that." });

    } catch (err) {
        console.error('Dialogflow error:', err);
        res.json({ reply: "Error connecting to Dialogflow" });
    }
});

// Fetch menu as JSON
app.get('/api/menu', async (req, res) => {
    try {
        const menuItems = await MenuItem.find();
        if (!menuItems.length) {
            return res.json({ menu: [] });
        }
        res.json({ menu: menuItems });
    } catch (err) {
        console.error('Error fetching menu:', err);
        res.status(500).json({ error: 'Server error fetching menu' });
    }
});

// Route to serve the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

// Routes to serve various HTML pages
const staticPages = [
    'cash.html',
    'customer_signin.html',
    'customer_signup.html',
    'Delivery.html',
    'deliveryCart.html',
    'employee_signin.html',
    'employee_signup.html',
    'mobile.html',
    'online_checkout.html',
    'order_details.html',
    'orderstate.html',
    'payment_details.html',
    'server.html',
    'waiter_orders.html'
];

staticPages.forEach(page => {
    app.get(`/pages/${page}`, (req, res) => {
        res.sendFile(path.join(__dirname, 'pages', page));
    });
});

app.get('/add-meal', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'add-meal.html'));
});

app.get('/views/available.ejs', async (req, res) => {
    const meals = await MenuItem.find();
    res.render('available',{
        meals: meals
    })  
});

app.get('/views/deliveryMenu.ejs', async (req, res) => {
    const meals = await MenuItem.find();
    res.render('deliveryMenu',{
        meals: meals
    })  
});

app.get('/views/venueMenu.ejs', async (req, res) => {
    const meals = await MenuItem.find();
    res.render('venueMenu',{
        meals: meals
    })  
});

app.post('/saveData', function(req, res) {
    const employeeData = req.body;

    if (employeeData.password !== employeeData['confirm-password']) {
        return res.status(400).send('Passwords do not match');
    }

    const newEmployee = new Employee({
        name: employeeData.name,
        phone: employeeData.phone,
        workID: employeeData['work-id'],
        role: employeeData.role,
        password: employeeData.password,
    });

    newEmployee.save()
        .then(() => {
            res.redirect('/pages/admin.html'); 
        })
        .catch(err => {
            console.error('Error saving employee:', err);
            res.status(500).send('Error saving employee to the database');
        });
});

app.post('/employee_signin', async (req, res) => {
    const { workId, password } = req.body;

    try {
        const employee = await Employee.findOne({ workID: workId, password: password });
        if (!employee) {
            return res.status(401).json({ success: false, message: 'Incorrect work ID or password' });
        }
        res.status(200).json({ success: true, message: 'Sign in successful' });
        req.session.employeeId = employee._id;
        req.session.role = employee.role;

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error checking credentials' });
    }
});

app.post('/saveCustomerData', async (req, res) => {
    const { name, phone, password } = req.body;

    const newCustomer = new Customer({
        name,
        phone,
        password
    });

    try {
        await newCustomer.save();
        res.status(200).json({ success: true, message: 'Customer registered successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error saving customer to the database' });
    }
});

app.post('/customer_signin', async (req, res) => {
    const { phone, password } = req.body;

    try {
        const customer = await Customer.findOne({ phone: phone, password: password });
        if (!customer) {
            return res.status(401).json({ success: false, message: 'Incorrect work ID or password' });
        }
        res.status(200).json({ success: true, message: 'Sign in successful' });
        req.session.authenticated = true;
        req.session.user = customer.phone;
        req.session.save();

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error checking credentials' });
    }
});

app.post('/add-meal', upload.single('image'), async (req, res) => {
    const { name, description, quantity, category, price } = req.body;
    const image = req.file ? `/images/${req.file.filename}` : '';

    const newMenuItem = new MenuItem({
        name,
        description,
        image,
        quantity,
        category,
        price
    });

    try {
        await newMenuItem.save();
        res.redirect('/pages/server.html');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.delete('/delete-meal/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await MenuItem.findByIdAndDelete(id);
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/orders/confirm', async (req, res) => {
    try {
        const orders = await Meal.find();
        const ServerOrder = mongoose.model('ServerOrder', Meal.schema, 'server');

        await ServerOrder.insertMany(orders);
        await Meal.deleteMany();

        res.status(200).send({ message: 'Orders confirmed and moved to server collection' });
    } catch (err) {
        res.status(500).send(err);
    }
});

app.delete('/api/orders/clear', async (req, res) => {
    try {
        await Meal.deleteMany();
        res.status(200).send({ message: 'Orders cleared' });
    } catch (err) {
        res.status(500).send(err);
    }
});

app.get('/menu', async (req, res) => {
    try {
      const menuItems = await MenuItem.find();
      res.render('menu', { menuItems });
    } catch (err) {
      res.status(500).send('Error retrieving menu items');
    }
  });

app.post('/api/add-items', async (req, res) => {
    try {
        const cartItems = req.body.cartItems;
        const phone = req.body.phone;
        const location = req.body.location;

        const orderId = uuidv4();

        const itemsToInsert = cartItems.map(item => ({
            name: item.name,
            description: item.description,
            image: item.image || '',
            quantity: item.quantity,
            price: item.price,
            category: item.category,
            state: 'online',
            customerPhone: phone,
            orderId: orderId,
            location: location
        }));

        const createdItems = await Item.create(itemsToInsert);

        res.status(201).json({"orderId": createdItems[0].orderId});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/add-order', async (req, res) => {
    try {
        const cartItems = req.body.cartItems;
        const workID = req.body.workID;
        const tableNumber = req.body.tableNumber;

        const orderId = uuidv4();

        const itemsToInsert = cartItems.map(item => ({
            name: item.name,
            description: item.description,
            image: item.image || '',
            quantity: item.quantity,
            price: item.price,
            category: item.category,
            state: 'venue',
            customerPhone: workID,
            tableNumber: tableNumber,
            orderId: orderId
        }));

        const createdItems = await Item.create(itemsToInsert);

        res.status(201).json(createdItems);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/get-items', async (req, res) => {
    try {
        const items = await Item.find({ state: { $ne: 'done' } });
        
        const waiterWorkIDs = [...new Set(items.map(item => item.waiterId))];

        const employees = await Employee.find({ workID: { $in: waiterWorkIDs } });

        const employeeMap = employees.reduce((acc, emp) => {
            acc[emp.workID] = { name: emp.name, phone: emp.phone };
            return acc;
        }, {});

        const itemsWithEmployeeDetails = items.map(item => ({
            ...item.toObject(),
            waiter: employeeMap[item.waiterId]
        }));

        res.status(200).json(itemsWithEmployeeDetails);
    } catch (error) {
        console.error(error);
        res.status(400).send("Error fetching items");
    }
});

app.put('/update-item/:id', (req, res) => {
    const { id } = req.params;
    const { serverId } = req.body;

    Item.findByIdAndUpdate(id, 
        { state: 'done', serverID: serverId },
        { new: true }
    )
    .then(item => res.status(200).json(item))
    .catch(err => res.status(400).send(err));
});

app.put('/update-paid/:id', (req, res) => {
    const { id } = req.params;
    Item.findByIdAndUpdate(id, { paid: true }, { new: true })
        .then(item => res.status(200).json(item))
        .catch(err => res.status(400).send(err));
});

app.get('/api/items', async (req, res) => {
    const customerPhone = req.query.customerPhone;

    try {
        const items = await Item.find({ customerPhone , paid : false });
        res.status(200).json(items);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/items/mark-as-paid/:tableNumber', async (req, res) => {
    const { tableNumber } = req.params;

    if (!tableNumber) {
        console.error('Table number is missing in the request');
        return res.status(400).json({ error: 'Table number is required' });
    }

    try {
        const items = await Item.find({ tableNumber: tableNumber, paid: false });

        if (items.length === 0) {
            return res.status(404).json({ error: 'No unpaid items found for this table' });
        }

        const updatePromises = items.map(async item => {
            await Item.findByIdAndUpdate(item._id, { $set: { paid: true } });
            await MenuItem.findOneAndUpdate(
                { name: item.name },
                { $inc: { quantity: -item.quantity } }
            );
        });

        await Promise.all(updatePromises);

        res.status(200).json({ message: 'Items updated successfully' });
    } catch (err) {
        console.error('Server error while updating items:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/items/:month', async (req, res) => {
    const month = parseInt(req.params.month, 10);
    try {
        const items = await Item.aggregate([
            { $match: { month: month } },
            { $group: { _id: "$name", totalOrdered: { $sum: "$quantity" } } },
            { $sort: { totalOrdered: -1 } }
        ]);
        res.json(items);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/most-wanted-item', async (req, res) => {
    try {
        const mostWantedItem = await Item.aggregate([
            { $group: { _id: "$name", totalOrdered: { $sum: "$quantity" } } },
            { $sort: { totalOrdered: -1 } },
            { $limit: 1 }
        ]);
        res.json(mostWantedItem[0]);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/reports/:year/:month/:week?/:day?', async (req, res) => {
    const { year, month, week, day } = req.params;

    let startDate, endDate;

    if (week) {
        const firstDayOfMonth = new Date(year, month - 1, 1);
        const startOfWeek = firstDayOfMonth.getDate() + (week - 1) * 7;
        startDate = new Date(year, month - 1, startOfWeek);
        endDate = new Date(year, month - 1, startOfWeek + 6, 23, 59, 59);
    } else if (day) {
        startDate = new Date(year, month - 1, day);
        endDate = new Date(year, month - 1, day, 23, 59, 59);
    } else {
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 0, 23, 59, 59);
    }

    try {
        const reportData = await Item.find({
            createdAt: {
                $gte: startDate,
                $lte: endDate
            }
        }).select('name quantity price customerPhone month');

        const reportWithCustomerNames = await Promise.all(reportData.map(async (item) => {
            let customerName = '';

            if (item.customerPhone.startsWith('w')) {
                const employee = await Employee.findOne({ workID: item.customerPhone });
                customerName = employee ? employee.name : 'Unknown Employee';
            } else if (item.customerPhone.startsWith('0')) {
                const customer = await Customer.findOne({ phone: item.customerPhone });
                customerName = customer ? customer.name : 'Unknown Customer';
            }

            return {
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                month: item.month,
                customerName: customerName
            };
        }));

        res.json(reportWithCustomerNames);

    
    } catch (err) {
        console.error('Error generating report:', err);
        res.status(500).send(err.message);
    }
});

app.get('/orderstatus', async (req, res) => {
    const orderId = req.query.id;
  
    try {
      const items = await Item.find({ orderId });
      const allDone = items.every(item => item.state === 'done');
      const order = await Delivery.findOne({orderId});

      const deliveryStatus = order !== null? order.status : false;

      const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        res.status(200).json({
            totalPrice: totalPrice,
            order: items,
            status: deliveryStatus === true? "delivered":  allDone === true? "ready": "online",
            ETA: order !== null? order.ETA:  "60",
            code: order !== null? order.code: "####",
            delivery: order
        });
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching order status');
    }
  });

app.post('/api/confirm-payment', async (req, res) => {
    const { orderID, payerID, cartItems, phone } = req.body;

    try {
        const tokenResponse = await axios.post('https://api-m.sandbox.paypal.com/v1/oauth2/token', 'grant_type=client_credentials', {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const accessToken = tokenResponse.data.access_token;

        const captureResponse = await axios.post(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`, {}, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Payment Details:', captureResponse.data);

        res.json({ success: true });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ success: false, message: 'Payment processing failed' });
    }
});

app.get('/get-drivers', async (req, res) => {
    try {
        const drivers = await Employee.find({ workID: /^d/ }).exec();
        res.json(drivers);
    } catch (error) {
        console.error('Error fetching drivers:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/update-delivery/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { driver, code } = req.body;

    try {
        const delivery = await Delivery.findOne({ orderId });
        if (!delivery) {
            return res.status(404).json({ error: 'Delivery not found' });
        }

        delivery.status = code == delivery.code;

        await delivery.save();

        res.json({ success: true, message: delivery.status === true? 'Delivery completed.' : "Invalid code."});
    } catch (error) {
        console.error('Error updating delivery:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/create-delivery', async (req, res) => {
    const { id, orderId, driver } = req.body;

    if (!orderId || !driver) {
        return res.status(400).json({ error: 'orderId and driver are required' });
    }

    const item = await Item.findOne({orderId: orderId});

    try {
        const newDelivery = new Delivery({
            orderId,
            driver,
            status: false,
            location: item.location,
            phone: item.customerPhone
        });

        await newDelivery.save();

        await Item.updateMany({orderId: orderId}, { state: 'done' }, { new: true });

        res.status(201).json({ success: true, message: 'Delivery created successfully', delivery: newDelivery });
    } catch (error) {
        console.error('Error creating delivery:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/deliveries/:driverId', async (req, res) => {
    try {
        const driverId = req.params.driverId;

        const deliveries = await Delivery.find({ driver: driverId, status: false });

        if (deliveries.length === 0) {
            return res.status(404).json({ message: 'No deliveries found for this driver.' });
        }

        res.json(deliveries);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while retrieving deliveries.' });
    }
});

app.put('/update-meal/:id', upload.single('image'), async (req, res) => {
    const mealId = req.params.id;
    const { name, description, quantity, price } = req.body;
    const image = req.file ? `/images/${req.file.filename}` : '';

    try {
        const updateFields = { name, description, quantity, price };
        if (image) updateFields.image = image;

        const updatedMeal = await MenuItem.findByIdAndUpdate(mealId, updateFields, { new: true });
        if (updatedMeal) {
            res.status(200).json(updatedMeal);
        } else {
            res.status(404).send('Meal not found');
        }
    } catch (error) {
        console.error('Error updating meal:', error);
        res.status(500).send('Error updating meal');
    }
});

app.get('/employees', async (req, res) => {
    try {
        const employees = await Employee.find().sort({ workID: 1 });
        res.json(employees);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/employee/:id', async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id);
        if (employee) {
            res.json(employee);
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.put('/update-employee/:id', async (req, res) => {
    try {
        const { name, phone, workID, role } = req.body;
        const employee = await Employee.findById(req.params.id);

        if (employee) {
            employee.name = name || employee.name;
            employee.phone = phone || employee.phone;
            employee.workID = workID || employee.workID;
            employee.role = role || employee.role;

            await employee.save();
            res.status(200).json({ message: 'Employee updated successfully' });
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.delete('/employees/:id', async (req, res) => {
    const employeeId = req.params.id;
    
    try {
        const result = await Employee.findByIdAndDelete(employeeId);
        if (result) {
            res.status(200).json({ message: 'Employee deleted successfully' });
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/order-history', async (req, res) => {
    const { customerName, paymentMethod, totalAmount, tableNumber, mealDetails } = req.body;
    const confirmedAt = new Date();

    try {
        const newOrder = new OrderHistory({
            confirmedAt,
            customerName,
            foodOrdered: mealDetails,
            tableNumber,
            totalAmount,
            paymentMethod
        });

        await newOrder.save();
        res.status(201).json({ message: 'Order history saved successfully' });
    } catch (err) {
        console.error('Error saving order history:', err);
        res.status(500).json({ error: 'Failed to save order history' });
    }
});

app.get('/api/order-history', async (req, res) => {
    try {
        const orders = await OrderHistory.find().sort({ confirmedAt: -1 });
        res.json(orders);
    } catch (err) {
        console.error('Error fetching order history:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}); 

app.get('/server-history/:serverId', async (req, res) => {
    const { serverId } = req.params;
    try {
        const orders = await Item.find({ serverID: serverId, state: 'done' });
        res.json(orders);
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

app.get("/driver-history/:driverId", async (req, res) => {
    try {
        const deliveries = await Delivery.find({ driver: req.params.driverId });
        res.json(deliveries);
    } catch (error) {
        console.error("Error fetching delivery history:", error);
        res.status(500).send("Server error");
    }
});

app.get('/get-employee', async (req, res) => {
    const { workId } = req.query;
    try {
        const employee = await Employee.findOne({ workID: workId });
        res.json(employee || {});
    } catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({ error: 'Error fetching employee' });
    }
});

app.get('/get-customer', async (req, res) => {
    const { phone } = req.query;
    try {
        const customer = await Customer.findOne({ phone });
        res.json(customer || {});
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({ error: 'Error fetching customer' });
    }
});
