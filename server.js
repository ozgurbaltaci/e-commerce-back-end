const express = require("express");
const app = express();
const cors = require("cors");
const pool = require("./db");
var Iyzipay = require("iyzipay");

app.use(cors());
app.use(express.json());

app.post("/createPayment", async (req, res) => {
  try {
    const iyzipay = new Iyzipay({
      apiKey: "sandbox-6NF29GbdT3I4IMUgWKdjRUIfAp25JUR4",
      secretKey: "sandbox-0bt2hNbgRkJwqPCMNITPpG5XBb7xzLnV",
      uri: "https://sandbox-api.iyzipay.com",
    });
    const { price, paidPrice, paymentCard, shippingAddress } = req.body;

    var request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: "123456789",
      price: price,
      paidPrice: paidPrice,
      currency: Iyzipay.CURRENCY.TRY,
      installment: "1",
      basketId: "B67832",
      paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      paymentCard: paymentCard,
      buyer: {
        id: "BY789",
        name: "John",
        surname: "Doe",
        gsmNumber: "+905350000000",
        email: "email@email.com",
        identityNumber: "74300864791",
        lastLoginDate: "2015-10-05 12:43:35",
        registrationDate: "2013-04-21 15:12:09",
        registrationAddress:
          "Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1",
        ip: "85.34.78.112",
        city: "Istanbul",
        country: "Turkey",
        zipCode: "34732",
      },
      shippingAddress: shippingAddress,
      billingAddress: shippingAddress,
      basketItems: [
        {
          id: "BI101",
          name: "Binocular",
          category1: "Collectibles",
          category2: "Accessories",
          itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
          price: "19.99",
        },

        {
          id: "BI103",
          name: "Usb",
          category1: "Electronics",
          category2: "Usb / Cable",
          itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
          price: "10.99",
        },
      ],
    };

    iyzipay.payment.create(request, function (err, result) {
      console.log("card number: -", paymentCard.cardNumber, "-");
      console.log(result);
      if (result.status !== "success") {
        console.error("ödeme alınamadı", result, err);
        return res.status(500).json({ error: "Payment creation failed" });
      } else {
        res.status(200).send();
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.get("/getDeneme", async (req, res) => {
  try {
    const allUsers = await pool.query("SELECT * FROM deneme");
    res.json(allUsers.rows);
  } catch (err) {
    console.error(err.message);
  }
});

app.listen(3002, () => {
  console.log("Server has started on port 3002");
});
