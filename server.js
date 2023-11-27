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
    campaigns,
    productStatus,
  } = req.body;

  try {
    const addProductQuery = await pool.query(
      "INSERT INTO products VALUES (default, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
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

    const product_id = addProductQuery.rows[0].id;

    for (const campaign of campaigns) {
      await pool.query("INSERT INTO product_campaigns VALUES ($1, $2, $3)", [
        product_id,
        campaign.type,
        campaign.campaign_validity_end_date,
      ]);
    }
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
      userFullName: `${user.rows[0].user_name} ${user.rows[0].user_surname}`,
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
            console.log(result);
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

app.get("/getProducts", async (req, res) => {
  try {
    // Fetch all products and related data in a single query
    const productsQuery = `
      SELECT
        p.id,
        p.manufacturer_id,
        p.product_name,
        p.price,
        p.discounted_price,
        p.image,
        p.description,
        p.stock_quantity,
        p.to_be_delivered_date,
        p.product_status,
        pr.rating,
        pc.campaign_text,
        m.manufacturer_name
      FROM products p
      LEFT JOIN product_reviews pr ON p.id = pr.product_id
      LEFT JOIN product_campaigns pc ON p.id = pc.product_id
      LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id;
    `;

    const productsRequest = await pool.query(productsQuery);
    const productsRows = productsRequest.rows;

    // Modify the structure inside the productsMap to include an array for ratings
    const productsMap = new Map();

    productsRows.forEach((item) => {
      const productId = item.id;
      if (!productsMap.has(productId)) {
        productsMap.set(productId, {
          id: item.id,
          manufacturerId: item.manufacturer_id,
          productName: item.product_name,
          price: +item.price,
          discountedPrice: +item.discounted_price,
          image: item.image,
          description: item.description,
          stockQuantity: item.stock_quantity,
          toBeDeliveredDate: item.to_be_delivered_date,
          productStatus: item.product_status,
          ratings: [], // Include an array to store ratings
          ratingsCount: 0,
          campaigns: [],
          manufacturerName: item.manufacturer_name,
        });
      }

      if (item.rating !== null) {
        productsMap.get(productId).ratings.push(item.rating);
        productsMap.get(productId).ratingsCount++;
      }

      if (item.campaign_text !== null) {
        productsMap.get(productId).campaigns.push(item.campaign_text);
      }
    });

    // Convert the map of products to an array
    const products = Array.from(productsMap.values());

    // Calculate the average rating using the calculateAverageRating function
    products.forEach((product) => {
      if (product.ratings.length > 0) {
        product.starPoint = calculateAverageRating(product.ratings);
      }
    });

    // Add the calculateAverageRating function
    function calculateAverageRating(reviews) {
      if (reviews.length === 0) {
        return 0; // Default to 0 if there are no reviews.
      }

      let sum = 0.0;
      reviews.map((review) => {
        sum = sum + parseFloat(review);
      });
      return sum / reviews.length;
    }

    // Send the response
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/getFavoritesOfUser/:user_id", async (req, res) => {
  try {
    // Get the user_id from the URL parameter
    const user_id = req.params.user_id;

    // Fetch favorite products for the specified user with manufacturer names
    const favoritesQuery =
      "SELECT p.image, p.price, p.discounted_price, m.manufacturer_name, p.product_name " +
      "FROM users_favorites uf " +
      "JOIN products p ON uf.product_id = p.id " +
      "JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id " +
      "WHERE uf.user_id = $1";

    const favoritesRequest = await pool.query(favoritesQuery, [user_id]);
    const favoriteProducts = favoritesRequest.rows;

    res.json(favoriteProducts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/getCart/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    // Fetch cart data based on userId
    const cartQuery = `
    SELECT
    c.cart_id,
    c.user_id,
    c.product_id,
    c.desired_amount,
    c.price_on_add,
    c.add_date,
    p.product_name,
    p.price,
    p.discounted_price,
    p.image,
    m.manufacturer_id,
    m.manufacturer_name
  FROM users_cart c
  LEFT JOIN products p ON c.product_id = p.id
  LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
  WHERE c.user_id = $1;
    `;
    const cartRequest = await pool.query(cartQuery, [userId]);
    const cartRows = cartRequest.rows;

    // Organize the data into cart items
    const cartItems = cartRows.map((item) => ({
      id: item.cart_id,
      userId: item.user_id,
      productId: item.product_id,
      desired_amount: item.desired_amount,
      priceOnAdd: +item.price_on_add,
      addDate: item.add_date,
      manufacturerId: item.manufacturer_id,
      manufacturer_name: item.manufacturer_name,

      productName: item.product_name,
      price: +item.price,
      discountedPrice: +item.discounted_price,
      image: item.image,
    }));

    res.json(cartItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: " error" });
  }
});
app.put("/updateDesiredAmount/:user_id/:productId", async (req, res) => {
  const { user_id, productId } = req.params;
  const { desiredAmount } = req.body;

  try {
    const updateQuery = `
      UPDATE users_cart
      SET desired_amount = $1
      WHERE user_id = $2 AND product_id = $3
    `;

    // Use the pool to execute the SQL query
    await pool.query(updateQuery, [desiredAmount, user_id, productId]);

    res.status(200).json({ message: "Desired amount updated successfully." });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
    console.error(err.message);
  }
});

app.get("/getFavoritesIdsOfUser/:user_id", async (req, res) => {
  try {
    // Get the user_id from the URL parameter
    const user_id = req.params.user_id;

    // Fetch favorite products for the specified user
    const favoritesQuery =
      "SELECT product_id FROM users_favorites WHERE user_id = $1 ";

    const favoritesIdsRequest = await pool.query(favoritesQuery, [user_id]);
    const favoriteProductsIds = favoritesIdsRequest.rows.map(
      (row) => row.product_id
    );

    res.json(favoriteProductsIds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/addToFavorite/:user_id", async (req, res) => {
  const user_id = req.params.user_id;

  const { product_id } = req.body;

  try {
    const request = await pool.query(
      "INSERT INTO users_favorites (id, user_id, product_id) VALUES (default, $1, $2)",
      [user_id, product_id]
    );

    res.status(201).send();
  } catch (err) {
    res.status(500).send();
    console.error(err.message);
  }
});

app.delete("/removeFromFavorite/:user_id/:product_id", async (req, res) => {
  const user_id = req.params.user_id;
  const product_id = req.params.product_id;

  try {
    const request = await pool.query(
      "DELETE FROM users_favorites WHERE user_id = $1 AND product_id = $2",
      [user_id, product_id]
    );

    res.status(200).send();
  } catch (err) {
    res.status(500).send();
    console.error(err.message);
  }
});

app.listen(3002, () => {
  console.log("Server has started on port 3002");
});
