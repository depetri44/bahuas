const express = require('express');
const { indexOrders, indexTransactions } = require('../indexing');
const { getId, sendEmail, getEmailTemplate } = require('../common');
const { getPaymentConfig } = require('../config');
const { emptyCart } = require('../cart');
const router = express.Router();

// The homepage of the site
router.post('/checkout_action', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const transaction = await db.transactions.insertOne({
        gateway: 'Pago en el local',
        gatewayReference: 'Pago en el Local o a convenir',
        amount: req.session.totalCartAmount,
        customer: getId(req.session.customerId),
        created: new Date()
    });
    const transactionId = transaction.insertedId;

    // Index transactios
    await indexTransactions(req.app);
    const orderDoc = {
        orderPaymentId: getId(),
        orderPaymentGateway: 'Instore',
        orderPaymentMessage: 'Su pago se completó con éxito',
        orderTotal: req.session.totalCartNetAmount,
        orderShipping: 0,
        orderItemCount: req.session.totalCartItems,
        orderProductCount: req.session.totalCartProducts,
        orderCustomer: getId(req.session.customerId),
        orderEmail: req.session.customerEmail,
        orderCompany: req.session.customerCompany,
        orderFirstname: req.session.customerFirstname,
        orderLastname: req.session.customerLastname,
        orderAddr1: req.session.customerAddress1,
        orderAddr2: req.session.customerAddress2,
        orderCountry: req.session.customerCountry,
        orderState: req.session.customerState,
        orderPostcode: req.session.customerPostcode,
        orderPhoneNumber: req.session.customerPhone,
        orderComment: req.session.orderComment,
        orderDate: new Date(),
        orderProducts: req.session.cart,
        orderStatus: getPaymentConfig.orderStatus,
        orderType: 'Single',
        transaction: transactionId
    };

    // insert order into DB
    try{
        const newDoc = await db.orders.insertOne(orderDoc);

        // get the new ID
        const newId = newDoc.insertedId;

        // add to lunr index
        indexOrders(req.app)
        .then(() => {
            // set the results
            req.session.messageType = 'success';
            req.session.message = 'Your order was successfully placed. Payment for your order will be completed instore.';
            req.session.paymentEmailAddr = newDoc.ops[0].orderEmail;
            req.session.paymentApproved = true;
            req.session.paymentDetails = `<p><strong>Orden Numero </strong>${newId}</p>
            <p><strong>Transacción Numero: </strong>${orderDoc.orderPaymentId}</p>`;

            // set payment results for email
            const paymentResults = {
                message: req.session.message,
                messageType: req.session.messageType,
                paymentEmailAddr: req.session.paymentEmailAddr,
                paymentApproved: true,
                paymentDetails: req.session.paymentDetails
            };

            // clear the cart
            if(req.session.cart){
                emptyCart(req, res, 'function');
            }

            // send the email with the response
            // TODO: Should fix this to properly handle result
            sendEmail(req.session.paymentEmailAddr, `Tu pedido con ${config.cartTitle}`, getEmailTemplate(paymentResults));

            // Return outcome
            res.json({ paymentId: newId });
        });
    }catch(ex){
        res.status(400).json({ err: 'Su pedido ha sido rechazado. Inténtalo de nuevo' });
    }
});

module.exports = router;
