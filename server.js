require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
var Iyzipay = require("iyzipay");

app.use(cors());
app.use(express.json());

function verifyAccessToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const accessToken = authHeader && authHeader.split(" ")[1];

  if (!accessToken) {
    return res.status(401).json({ message: "Access token not provided" });
  }

  jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Access token is not valid" });
    }
    req.user = user;
    next();
  });
}

app.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.user_password, 10);
    const { user_name, user_surname, user_mail, user_phone, user_role } =
      req.body;
    const request = await pool.query(
      "INSERT INTO users (user_id, user_name, user_surname, user_mail, user_phone, user_role, user_password) VALUES (default, $1, $2, $3, $4, $5, $6)",
      [
        user_name,
        user_surname,
        user_mail,
        user_phone,
        user_role,
        hashedPassword,
      ]
    );

    res.status(201).send();
  } catch (err) {
    res.status(500).send();
    console.error(err.message);
  }
});

app.post("/login", async (req, res) => {
  try {
    const { user_mail, user_password } = req.body;

    // Check if the user with the provided email exists in the database
    const user = await pool.query("SELECT * FROM users WHERE user_mail = $1", [
      user_mail,
    ]);

    if (user.rows.length === 0) {
      return res.status(401).json({ message: "User can not be found" });
    }

    // Compare the provided password with the hashed password stored in the database
    const passwordMatch = await bcrypt.compare(
      user_password,
      user.rows[0].user_password
    );

    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // If the credentials are valid, generate an access token
    const accessToken = jwt.sign(
      { userId: user.rows[0].user_id },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "1h", // Set an expiration time for the access token
      }
    );

    res.status(200).json({ accessToken });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.post("/createPayment", async (req, res) => {
  try {
    const iyzipay = new Iyzipay({
      apiKey: "sandbox-6NF29GbdT3I4IMUgWKdjRUIfAp25JUR4",
      secretKey: "sandbox-0bt2hNbgRkJwqPCMNITPpG5XBb7xzLnV",
      uri: "https://sandbox-api.iyzipay.com",
    });
    const { price, paidPrice, paymentCard, basketItems, shippingAddress } =
      req.body;

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
      basketItems: basketItems,
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
