require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
var Iyzipay = require("iyzipay");
const bodyParser = require("body-parser");

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 50000,
  })
);

function verifyToken(req, res, next) {
  const bearerHeader = req.headers["authorization"];
  if (typeof bearerHeader !== "undefined") {
    const bearer = bearerHeader.split(" ");
    const bearerToken = bearer[1];
    req.token = bearerToken;
    next();
  } else {
    res.sendStatus(403);
  }
}
app.post("/uploadProduct", async (req, res) => {
  const {
    manufacturerName,
    productName,
    price,
    discountedPrice,
    image,
    category,
    description,
    stockQuantity,
    toBeDeliveredDate,
    productStatus,
  } = req.body;

  try {
    const addProductQuery = await pool.query(
      "INSERT INTO products VALUES (default, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [
        manufacturerName,
        productName,
        parseFloat(price),
        parseFloat(discountedPrice),
        image,
        category,
        description,
        parseInt(stockQuantity),
        toBeDeliveredDate,
        productStatus,
      ]
    );
    //const product_id = addProductQuery.rows[0].product_id;

    /**const addProduct_campaigns_query = await pool.query(
      "INSERT INTO product_campaigns VALUES ($1, $2, $3)",
      [
        product_id,
        campaigns.campaign_text,
        campaigns.campaign_validity_end_date,
      ]
    ); */
  } catch (err) {
    res.status(500).send();
    console.error(err.message);
  }
});

app.post("/register", async (req, res) => {
  const {
    user_name,
    user_surname,
    user_mail,
    user_phone,
    user_role,
    user_password,
  } = req.body;
  const hashedPassword = await bcrypt.hash(user_password, 10);

  // Check if required fields are empty
  if (
    !user_name ||
    !user_surname ||
    !user_mail ||
    !user_phone ||
    !user_role ||
    !user_password
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }
  try {
    const checkMail = await pool.query(
      "SELECT user_mail from users WHERE user_mail=$1",
      [user_mail]
    );
    if (checkMail.rows.length > 0) {
      return res.status(409).json({ error: "All fields are required." });
    } else {
      try {
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
    }
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

    res.status(200).json({
      user_id: user.rows[0].user_id,
      accessToken: accessToken,
      user_name: user.rows[0].user_name,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.post("/createPayment", verifyToken, async (req, res) => {
  jwt.verify(req.token, process.env.ACCESS_TOKEN_SECRET, (err, authData) => {
    if (err) {
      console.log(err);
      res.sendStatus(403);
    } else {
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
          if (result.status === "success") {
            res.status(200).send();
          } else {
            console.error("ödeme alınamadı", result, err);
            return res.status(500).json({ error: "Payment creation failed" });
          }
        });
      } catch (err) {
        console.log(err.message);
        res.status(500).send("Server Error");
      }
    }
  });
});

app.get("/getDeneme", async (req, res) => {
  try {
    const allUsers = await pool.query("SELECT * FROM deneme");
    res.json(allUsers.rows);
  } catch (err) {
    console.error(err.message);
  }
});

function calculateAverageRating(reviews) {
  if (reviews.length === 0) {
    return 0; // Default to 0 if there are no reviews.
  }

  let sum = 0.0;
  reviews.map((review, index) => {
    sum = sum + parseFloat(review.rating);
  });
  return sum / reviews.length;
}

app.get("/getProducts", async (req, res) => {
  try {
    // Fetch all products from the Products table
    const productsRequest = await pool.query("SELECT * FROM products");
    const productsRows = productsRequest.rows;

    // Create an array to hold all product data
    const products = await Promise.all(
      productsRows.map(async (item) => {
        const productId = item.id;

        // Fetch product variations, reviews, shipping information, related products, and campaigns for each product
        const variationsQuery = `SELECT * FROM product_variations WHERE product_id = $1`;
        const variationsRows = await pool.query(variationsQuery, [productId]);

        const ratingPointQuery = `SELECT rating FROM product_reviews WHERE product_id = $1`;
        const ratings = await pool.query(ratingPointQuery, [productId]);

        const campaignsQuery = `SELECT campaign_text FROM product_campaigns WHERE product_id = $1`;
        const campaignsRows = await pool.query(campaignsQuery, [productId]);

        // Create the JSON response object for the current product
        const productData = {
          id: item.id,
          manufacturerName: item.manufacturer_name,
          productName: item.product_name,
          price: item.price,
          discountedPrice: item.discounted_price,
          image: item.image,
          description: item.description,
          stockQuantity: item.stock_quantity,
          toBeDeliveredDate: item.to_be_delivered_date,
          productStatus: item.product_status,

          variations: variationsRows.rows,
          ratingsCount: ratings.rows.length,
          starPoint: calculateAverageRating(ratings.rows),

          campaigns: campaignsRows.rows.map(
            (campaign) => campaign.campaign_text
          ),
        };
        return productData;
      })
    );

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(3002, () => {
  console.log("Server has started on port 3002");
});
