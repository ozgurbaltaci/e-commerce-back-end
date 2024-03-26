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
    const expirationTime = new Date(new Date().getTime() + 36000 * 1000);

    res.status(200).json({
      user_id: user.rows[0].user_id,
      accessToken: accessToken,
      user_name: user.rows[0].user_name,
      user_surname: user.rows[0].user_surname,
      user_phone: user.rows[0].user_phone,
      user_mail: user.rows[0].user_mail,
      accessTokenExpirationTime: expirationTime,
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
        const {
          price,
          paidPrice,
          paymentCard,
          basketItems,
          shippingAddress,
          buyerInfo,
        } = req.body;

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
            id: buyerInfo.user_id,
            name: buyerInfo.user_name,
            surname: buyerInfo.user_surname,
            gsmNumber: buyerInfo.user_phone,
            email: buyerInfo.user_mail,
            identityNumber: "11111111111",
            lastLoginDate: "2113-04-21 15:12:09",
            registrationDate: "2113-04-21 15:12:09",
            registrationAddress: "-",
            ip: "11.11.11.111",
            city: "-",
            country: "Turkey",
            zipCode: "11111",
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
    p.category_id,
    p.sub_category_id,
    p.star_point,
    COUNT(pr.rating) AS ratings_count,
    MAX(pr.rating) AS max_rating,
    pc.campaign_text,
    m.manufacturer_name
FROM 
    products p
LEFT JOIN 
    product_reviews pr ON p.id = pr.product_id
LEFT JOIN 
    product_campaigns pc ON p.id = pc.product_id
LEFT JOIN 
    manufacturers m ON p.manufacturer_id = m.manufacturer_id
GROUP BY 
    p.id, 
    m.manufacturer_id, 
    pc.campaign_text, 
    m.manufacturer_name;

    `;

    const productsRequest = await pool.query(productsQuery);
    const productsRows = productsRequest.rows;

    // Modify the structure inside the productsMap to include an array for ratings
    const productsMap = new Map();

    productsRows.forEach((item) => {
      const id = item.id;
      if (!productsMap.has(id)) {
        productsMap.set(id, {
          product_id: item.id,
          manufacturerId: item.manufacturer_id,
          productName: item.product_name,
          price: item.price !== null ? +item.price : null,
          discountedPrice:
            item.discounted_price !== null ? +item.discounted_price : null,
          image: item.image,
          description: item.description,
          stockQuantity: item.stock_quantity,
          toBeDeliveredDate: item.to_be_delivered_date,
          productStatus: item.product_status,
          ratings: [], // Include an array to store ratings
          ratingsCount: item.ratings_count,
          campaigns: [],
          starPoint: item.star_point,
          manufacturerName: item.manufacturer_name,
          category_id: item.category_id,
          sub_category_id: item.sub_category_id,
        });
      }

      if (item.campaign_text !== null) {
        productsMap.get(id).campaigns.push(item.campaign_text);
      }
    });

    // Convert the map of products to an array
    const products = Array.from(productsMap.values());

    // Send the response
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/searchProducts", async (req, res) => {
  try {
    const { searchInput } = req.query;

    // Fetch products with matching product name or description
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
        p.category_id,
        p.sub_category_id,
        c.category_name,
        sc.sub_category_name,
        pc.campaign_text,
        COUNT(pr.rating) AS ratings_count,
        m.manufacturer_name,
        p.star_point
      FROM 
        products p
      LEFT JOIN 
        product_reviews pr ON p.id = pr.product_id
      LEFT JOIN 
        product_campaigns pc ON p.id = pc.product_id
      LEFT JOIN 
        manufacturers m ON p.manufacturer_id = m.manufacturer_id
      LEFT JOIN 
        categories c ON p.category_id = c.category_id
      LEFT JOIN 
        sub_categories sc ON p.sub_category_id = sc.sub_category_id
      WHERE 
        LOWER(p.product_name) LIKE LOWER($1)
        OR LOWER(p.description) LIKE LOWER($1)
      GROUP BY 
        p.id, 
        c.category_name,
        m.manufacturer_id, 
        pc.campaign_text, 
        c.category_name,
        sc.sub_category_name,
        m.manufacturer_name;
    `;

    const productsRequest = await pool.query(productsQuery, [
      `%${searchInput}%`,
    ]);
    const productsRows = productsRequest.rows;

    // Modify the structure inside the productsMap to include an array for ratings
    const productsMap = new Map();

    productsRows.forEach((item) => {
      const id = item.id;
      if (!productsMap.has(id)) {
        productsMap.set(id, {
          product_id: item.id,
          manufacturerId: item.manufacturer_id,
          productName: item.product_name,
          price: item.price !== null ? +item.price : null,
          discountedPrice:
            item.discounted_price !== null ? +item.discounted_price : null,
          image: item.image,
          description: item.description,
          category_name: item.category_name,
          sub_category_name: item.sub_category_name,
          stockQuantity: item.stock_quantity,
          toBeDeliveredDate: item.to_be_delivered_date,
          productStatus: item.product_status,
          ratings: [], // Include an array to store ratings
          ratingsCount: item.ratings_count,
          campaigns: [],
          manufacturerName: item.manufacturer_name,
          category_id: item.category_id,
          sub_category_id: item.sub_category_id,
          starPoint: item.star_point,
        });
      }

      if (item.campaign_text !== null) {
        productsMap.get(id).campaigns.push(item.campaign_text);
      }
    });

    // Convert the map of products to an array
    const products = Array.from(productsMap.values());

    // Send the response
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/getCategories", async (req, res) => {
  try {
    const cateogriesQuery = "SELECT * FROM categories";
    const getCategoriesRequest = await pool.query(cateogriesQuery);
    res.json(getCategoriesRequest.rows);
  } catch (err) {
    console.log(err);
  }
});

app.get("/getSubCategoriesOfCurrentCategory/:category_id", async (req, res) => {
  try {
    const category_id = req.params.category_id;
    const sub_categories_query =
      "SELECT category_id, sub_category_id, sub_category_name, sub_category_img FROM sub_categories WHERE category_id = $1 ORDER BY sub_category_id ASC";
    const getSubCategoriesRequest = await pool.query(sub_categories_query, [
      category_id,
    ]);
    res.json(getSubCategoriesRequest.rows);
  } catch (err) {
    console.log(err);
  }
});

app.get("/getCategoriesWithSubCategories", async (req, res) => {
  try {
    const categoriesQuery = "SELECT category_id, category_name FROM categories";
    const categoriesResult = await pool.query(categoriesQuery);
    const categories = categoriesResult.rows;

    const categoriesWithSubCategories = await Promise.all(
      categories.map(async (category) => {
        const categoryId = category.category_id;
        const subCategoriesQuery =
          "SELECT sub_category_id, sub_category_name FROM sub_categories WHERE category_id = $1 ORDER BY sub_category_id ASC ";
        const subCategoriesResult = await pool.query(subCategoriesQuery, [
          categoryId,
        ]);
        const subCategories = subCategoriesResult.rows;
        return { ...category, sub_categories: subCategories };
      })
    );

    res.json(categoriesWithSubCategories);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get(
  "/getProductsOfCurrentSubCategory/:sub_category_id",
  async (req, res) => {
    const sub_category_id = req.params.sub_category_id;
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
      p.star_point,
      p.description,
      p.stock_quantity,
      p.to_be_delivered_date,
      p.product_status,
      p.category_id,
      p.sub_category_id,
      c.category_name,
      sc.sub_category_name,
      pc.campaign_text,
      COUNT(pr.rating) AS ratings_count,
      m.manufacturer_name
    
    FROM products p
    LEFT JOIN product_reviews pr ON p.id = pr.product_id
    LEFT JOIN product_campaigns pc ON p.id = pc.product_id
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
    LEFT JOIN categories c ON p.category_id = c.category_id
    LEFT JOIN sub_categories sc ON p.sub_category_id = sc.sub_category_id WHERE p.sub_category_id = $1 GROUP BY 
    p.id, 
    c.category_name,
    m.manufacturer_id, 
    pc.campaign_text, 
    c.category_name,
    sc.sub_category_name,
    m.manufacturer_name;
;
    `;

      const productsRequest = await pool.query(productsQuery, [
        sub_category_id,
      ]);
      const productsRows = productsRequest.rows;

      // Modify the structure inside the productsMap to include an array for ratings
      const productsMap = new Map();

      productsRows.forEach((item) => {
        const id = item.id;
        if (!productsMap.has(id)) {
          productsMap.set(id, {
            product_id: item.id,
            manufacturerId: item.manufacturer_id,
            productName: item.product_name,
            price: item.price !== null ? +item.price : null,
            discountedPrice:
              item.discounted_price !== null ? +item.discounted_price : null,
            image: item.image,
            description: item.description,
            category_name: item.category_name,
            sub_category_name: item.sub_category_name,
            stockQuantity: item.stock_quantity,
            toBeDeliveredDate: item.to_be_delivered_date,
            productStatus: item.product_status,
            ratings: [], // Include an array to store ratings
            ratingsCount: item.ratings_count,
            campaigns: [],
            manufacturerName: item.manufacturer_name,
            category_id: item.category_id,
            sub_category_id: item.sub_category_id,
            starPoint: item.star_point,
          });
        }

        if (item.campaign_text !== null) {
          productsMap.get(id).campaigns.push(item.campaign_text);
        }
      });

      // Convert the map of products to an array
      const products = Array.from(productsMap.values());

      // Send the response
      res.json(products);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get("/getProductDetails/:product_id", async (req, res) => {
  const product_id = req.params.product_id;
  try {
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
      p.category_id,
      p.sub_category_id,
      p.star_point,
      c.category_name,
      sc.sub_category_name,
      COUNT(pr.id) AS ratings_count,
      pc.campaign_text,
      m.manufacturer_name
    FROM products p
    LEFT JOIN product_reviews pr ON p.id = pr.product_id
    LEFT JOIN product_campaigns pc ON p.id = pc.product_id
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
    LEFT JOIN categories c ON p.category_id = c.category_id
    LEFT JOIN sub_categories sc ON p.sub_category_id = sc.sub_category_id
    WHERE p.id = $1
    GROUP BY
      p.id,
      c.category_name,
      sc.sub_category_name,
      pc.campaign_text,
      m.manufacturer_name;
  `;

    const productDetailsRequest = await pool.query(productsQuery, [product_id]);
    const productWithDetails = productDetailsRequest.rows[0];

    // Kullanıcı bilgilerini ayrı bir sorgu ile çekme
    const userReviewsQuery = `
    SELECT
      pr.rating,
      pr.review_text,
      u.user_name,
      u.user_surname
    FROM product_reviews pr
    LEFT JOIN users u ON pr.user_id = u.user_id
    WHERE pr.product_id = $1;
  `;

    const userReviewsRequest = await pool.query(userReviewsQuery, [product_id]);
    const userReviews = userReviewsRequest.rows;

    // Kullanıcı yorumlarını ana ürün detaylarına ekleme
    productWithDetails.reviewsAndRatings = userReviews;

    // Send the response
    res.json(productWithDetails);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Function to calculate average rating
function calculateAverageRating(reviews) {
  const sum = reviews.reduce((total, review) => total + parseFloat(review), 0);
  return sum / reviews.length;
}
app.post("/saveRatingAndReview/:user_id/:product_id", async (req, res) => {
  const { user_id, product_id } = req.params;
  const { ratingPoint, review, manufacturer_id } = req.body;

  try {
    // Insert the rating and review into the product_reviews table
    await pool.query(
      "INSERT INTO product_reviews (id, user_id, product_id, rating, review_text) VALUES (default, $1, $2, $3, $4)",
      [user_id, product_id, ratingPoint, review]
    );

    // Calculate average rating
    const avgRatingRequest = await pool.query(
      "SELECT AVG(rating) AS avg_rating FROM product_reviews WHERE product_id = $1",
      [product_id]
    );
    const avgRating = avgRatingRequest.rows[0].avg_rating;

    // Update the average rating in the products table
    await pool.query("UPDATE products SET star_point = $1 WHERE id = $2", [
      avgRating,
      product_id,
    ]);

    await updateManufacturerRating(manufacturer_id);

    res.status(201).send("Rating and review saved successfully.");
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Internal server error.");
  }
});

app.get("/getFavoritesOfUser/:user_id", async (req, res) => {
  try {
    // Get the user_id from the URL parameter
    const user_id = req.params.user_id;
    // Fetch favorite products for the specified user with additional data
    const favoritesQuery = `
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
FROM users_favorites uf
JOIN products p ON uf.product_id = p.id
LEFT JOIN product_reviews pr ON p.id = pr.product_id
LEFT JOIN product_campaigns pc ON p.id = pc.product_id
LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
WHERE uf.user_id = $1;
`;

    const favoritesRequest = await pool.query(favoritesQuery, [user_id]);
    const favoriteProductsRows = favoritesRequest.rows;

    const favoriteProductsMap = new Map();

    favoriteProductsRows.forEach((item) => {
      const id = item.id;
      if (!favoriteProductsMap.has(id)) {
        favoriteProductsMap.set(id, {
          product_id: item.id,
          manufacturerId: item.manufacturer_id,
          productName: item.product_name,
          price: item.price !== null ? +item.price : null,
          discountedPrice:
            item.discounted_price !== null ? +item.discounted_price : null,
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
        favoriteProductsMap.get(id).ratings.push(item.rating);
        favoriteProductsMap.get(id).ratingsCount++;
      }

      if (item.campaign_text !== null) {
        favoriteProductsMap.get(id).campaigns.push(item.campaign_text);
      }
    });

    // Convert the map of products to an array
    const products = Array.from(favoriteProductsMap.values());

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
      cart_id: item.cart_id,
      product_id: item.product_id,
      user_id: item.user_id,
      desired_amount: item.desired_amount,
      price_on_add: item.price_on_add !== null ? +item.price_on_add : null,
      add_date: item.add_date,
      manufacturer_id: item.manufacturer_id,
      manufacturer_name: item.manufacturer_name,

      product_name: item.product_name,
      price: item.price !== null ? +item.price : null,
      discounted_price:
        item.discounted_price !== null ? +item.discounted_price : null,
      image: item.image,
    }));

    res.json(cartItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: " error" });
  }
});
app.put("/updateDesiredAmount/:user_id/:id", async (req, res) => {
  const { user_id, id } = req.params;
  const { desired_amount } = req.body;

  try {
    const updateQuery = `
      UPDATE users_cart
      SET desired_amount = $1
      WHERE user_id = $2 AND product_id = $3
    `;

    // Use the pool to execute the SQL query
    const result = await pool.query(updateQuery, [desired_amount, user_id, id]);

    // Check if any rows were affected by the update
    if (result.rowCount === 0) {
      // No rows were affected, meaning the product is not in the cart
      return res.status(404).json({ error: "Product not found in the cart." });
    }

    // Rows were affected, so the update was successful
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

app.post("/addToCart/:user_id/:product_id/:price_on_add", async (req, res) => {
  const user_id = req.params.user_id;
  const product_id = req.params.product_id;
  const price_on_add = req.params.price_on_add;

  try {
    const request = await pool.query(
      "INSERT INTO users_cart (cart_id, user_id, product_id, desired_amount, price_on_add, add_date) VALUES (default, $1, $2, 1, $3, CURRENT_TIMESTAMP) RETURNING *",
      [user_id, product_id, price_on_add]
    );

    const insertedRow = request.rows[0]; // Assuming only one row is returned

    res.status(201).json(insertedRow);
  } catch (err) {
    res.status(500).send();
    console.error(err.message);
  }
});

const generateOrderId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let orderId = "";
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    orderId += characters.charAt(randomIndex);
  }
  return orderId;
};

const isOrderIdUnique = async (orderId) => {
  const result = await pool.query(
    "SELECT COUNT(*) FROM orders_table WHERE order_id = $1",
    [orderId]
  );
  return result.rows[0].count === 0;
};

app.post("/saveOrder/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;
    const { selectedProducts, receiverName, receiverPhone, deliveryAddress } =
      req.body;

    const order_id = generateOrderId();

    // Loop through each selected product and save it to the orders_table
    const promises = selectedProducts.map(async (product) => {
      const { product_id, desired_amount, currPrice, manufacturer_id } =
        product;

      // Replace the following with your actual database query to insert into orders_table
      await pool.query(
        "INSERT INTO orders_table (order_id, user_id, product_id, desired_amount, price_on_add, order_status_id, order_date, manufacturer_id, delivery_address, receiver_phone, receiver_name) VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP, $6, $7, $8, $9)",
        [
          order_id,
          userId,
          product_id,
          desired_amount,
          currPrice,
          manufacturer_id,
          deliveryAddress,
          receiverPhone,
          receiverName,
        ]
      );
    });

    await Promise.all(promises);

    res.status(200).json({ message: "Orders saved successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.get("/getOrders/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;

    // Replace the following with your actual database query to retrieve orders with product information
    const result = await pool.query(
      "SELECT o.order_id, o.desired_amount, o.price_on_add, o.order_status_id, o.order_date, os.order_status, p.product_name, p.description, p.image, p.manufacturer_id, m.manufacturer_name FROM orders_table o LEFT JOIN products p ON o.product_id = p.id LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id LEFT JOIN order_status os ON o.order_status_id = os.order_status_id WHERE o.user_id = $1 ORDER BY o.order_id;",
      [userId]
    );

    const ordersWithProducts = [];
    let currentOrder = null;

    // Process the query result to create the desired response structure
    result.rows.forEach((row) => {
      // Check if the order has changed
      if (!currentOrder || currentOrder.order_id !== row.order_id) {
        // Create a new order object
        currentOrder = {
          order_id: row.order_id,
          order_date: row.order_date.toLocaleDateString("en-US", {
            timeZone: "Europe/Istanbul",
          }),
          order_status: row.order_status,
          products: [],
          total_price: 0, // Initialize total_price for the order
        };
        ordersWithProducts.push(currentOrder);
      }

      // Calculate the total price for the current product and add it to the order's total_price
      const totalPriceForProduct = row.desired_amount * row.price_on_add;
      currentOrder.total_price += totalPriceForProduct;

      // Add the product details to the current order's products array
      currentOrder.products.push({
        order_status_id: row.order_status_id,

        product_name: row.product_name,
        description: row.description,
        image: row.image,
        manufacturer_id: row.manufacturer_id,
        manufacturer_name: row.manufacturer_name,
        desired_amount: row.desired_amount,
        price_on_add: row.price_on_add,
        total_price_for_product: totalPriceForProduct,
      });
    });

    res.status(200).json({ orders: ordersWithProducts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.get("/getManufacturersOrders/:manufacturer_id", async (req, res) => {
  try {
    const manufacturerId = req.params.manufacturer_id;

    // Fetch manufacturer information
    const manufacturerInfoQuery = await pool.query(
      "SELECT * FROM manufacturers WHERE manufacturer_id = $1",
      [manufacturerId]
    );
    const manufacturerInfo = manufacturerInfoQuery.rows[0];

    // Calculate total sales, total income, pending orders, and pending refunds
    const totalSalesQuery = await pool.query(
      "SELECT COALESCE(SUM(o.desired_amount), 0) AS total_sales FROM orders_table o JOIN products p ON o.product_id = p.id WHERE p.manufacturer_id = $1",
      [manufacturerId]
    );
    const totalSales = parseFloat(totalSalesQuery.rows[0].total_sales);

    const totalIncomeQuery = await pool.query(
      "SELECT COALESCE(SUM(o.desired_amount * o.price_on_add), 0) AS total_income FROM orders_table o JOIN products p ON o.product_id = p.id WHERE p.manufacturer_id = $1",
      [manufacturerId]
    );
    const totalIncome = parseFloat(totalIncomeQuery.rows[0].total_income);

    //order_status_id = 1 represents the pending orders
    const pendingOrdersQuery = await pool.query(
      "SELECT COUNT(*) AS pending_orders FROM orders_table o JOIN products p ON o.product_id = p.id WHERE p.manufacturer_id = $1 AND o.order_status_id = $2",
      [manufacturerId, 1]
    );
    const pendingOrders = parseInt(pendingOrdersQuery.rows[0].pending_orders);

    const result = await pool.query(
      "SELECT o.order_id, o.desired_amount, o.price_on_add, o.order_status_id, o.order_date, os.order_status, o.receiver_phone, o.receiver_name, p.product_name, p.image, p.description, p.manufacturer_id, m.manufacturer_name, o.delivery_address, p.stock_quantity, (o.order_date + interval '2 weeks') AS delivery_deadline FROM orders_table o LEFT JOIN products p ON o.product_id = p.id LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id LEFT JOIN order_status os ON o.order_status_id = os.order_status_id WHERE p.manufacturer_id = $1 ORDER BY o.order_id;",
      [manufacturerId]
    );

    const ordersWithProducts = [];
    let currentOrder = null;

    // Process the query result to create the desired response structure
    result.rows.forEach((row) => {
      // Check if the order has changed
      if (!currentOrder || currentOrder.order_id !== row.order_id) {
        // Create a new order object
        currentOrder = {
          order_id: row.order_id,
          order_status_id: row.order_status_id,
          order_date: row.order_date.toLocaleDateString("en-US", {
            timeZone: "Europe/Istanbul",
          }),
          order_status: row.order_status,
          products: [],
          total_price: 0, // Initialize total_price for the order
          receiver_phone: row.receiver_phone,
          receiver_name: row.receiver_name,

          delivery_address: row.delivery_address,
          delivery_deadline: row.delivery_deadline.toLocaleDateString("en-US", {
            timeZone: "Europe/Istanbul",
          }),
        };
        ordersWithProducts.push(currentOrder);
      }

      // Calculate the total price for the current product and add it to the order's total_price
      const totalPriceForProduct = row.desired_amount * row.price_on_add;
      currentOrder.total_price += totalPriceForProduct;

      // Add the product details to the current order's products array
      currentOrder.products.push({
        product_name: row.product_name,
        description: row.description,
        image: row.image,
        manufacturer_id: row.manufacturer_id,
        manufacturer_name: row.manufacturer_name,
        desired_amount: row.desired_amount,
        price_on_add: row.price_on_add,
        total_price_for_product: totalPriceForProduct,
        stock_quantity: row.stock_quantity,
      });
    });

    const response = {
      manufacturerInfo: {
        ...manufacturerInfo,
        totalSales: totalSales,
        totalIncome: totalIncome,
        pendingOrders: pendingOrders,
      },
      orders: ordersWithProducts,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.put(
  "/updateOrderStatus/:order_id/:manufacturer_id/:order_status_id",
  async (req, res) => {
    try {
      const order_status_id = parseInt(req.params.order_status_id);
      const order_id = req.params.order_id;
      const manufacturer_id = req.params.manufacturer_id;

      // Replace the following with your actual database query to retrieve orders with product information
      const result = await pool.query(
        "UPDATE orders_table SET order_status_id = $1 WHERE order_id = $2 AND manufacturer_id = $3",
        [order_status_id, order_id, manufacturer_id]
      );
      res.status(200).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error." });
    }
  }
);

app.get("/getCurrentUser/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;

    // Replace the following with your actual database query to retrieve orders with product information
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1 ", [
      userId,
    ]);

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.put("/updateUser/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;
    const { currentUser } = req.body;

    // Replace the following with your actual database query to retrieve orders with product information
    const result = await pool.query(
      "UPDATE users SET user_name = $1, user_surname = $2, user_mail = $3, user_phone = $4 WHERE user_id = $5 ",
      [
        currentUser.user_name,
        currentUser.user_surname,
        currentUser.user_mail,
        currentUser.user_phone,
        userId,
      ]
    );
    res.status(201).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.put("/updatePassword/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;
    const { newPassword, currentPassword } = req.body;

    // Validate request body
    if (!newPassword || !currentPassword) {
      return res
        .status(400)
        .json({ error: "Both newPassword and currentPassword are required." });
    }

    // Retrieve current password from the database
    const user = await pool.query(
      "SELECT user_password FROM users WHERE user_id = $1",
      [userId]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const hashedCurrentPassword = user.rows[0].user_password;

    // Compare currentPassword with the hashed password stored in the database
    const passwordMatch = await bcrypt.compare(
      currentPassword,
      hashedCurrentPassword
    );
    if (!passwordMatch) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password in the database
    await pool.query("UPDATE users SET user_password = $1 WHERE user_id = $2", [
      hashedNewPassword,
      userId,
    ]);

    res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.get("/getReviewsOfCurrentUser/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;

    // Replace the following with your actual database query to retrieve orders with product information
    const result = await pool.query(
      "SELECT rw.id, rw.review_text, rw.rating, p.image, p.description, p.manufacturer_id, m.manufacturer_name FROM product_reviews rw LEFT JOIN products p ON rw.product_id = p.id LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id WHERE rw.user_id = $1 ",
      [userId]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.put("/updateReview/:review_id", async (req, res) => {
  try {
    const reviewId = req.params.review_id;
    const { updatedReviewText, updatedRating, manufacturer_id } = req.body;
    console.log(reviewId, updatedReviewText, updatedRating);
    const result = await pool.query(
      "UPDATE product_reviews SET review_text = $1, rating = $2 WHERE id = $3",
      [updatedReviewText, updatedRating, reviewId]
    );

    // Calculate average rating
    const avgRatingRequest = await pool.query(
      "SELECT AVG(rating) AS avg_rating FROM product_reviews WHERE product_id = (SELECT product_id FROM product_reviews WHERE id = $1)",
      [reviewId]
    );
    const avgRating = avgRatingRequest.rows[0].avg_rating;

    // Update the average rating in the products table
    await pool.query(
      "UPDATE products SET star_point = $1 WHERE id = (SELECT product_id FROM product_reviews WHERE id = $2)",
      [avgRating, reviewId]
    );

    await updateManufacturerRating(manufacturer_id);
    res.status(201).json({ message: "Review updated successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error." });
  }
});

app.delete("/deleteReview/:review_id", async (req, res) => {
  try {
    const reviewId = req.params.review_id;
    const { manufacturer_id } = req.body;

    // Retrieve the product ID before deleting the review
    const productIdRequest = await pool.query(
      "SELECT product_id FROM product_reviews WHERE id = $1",
      [reviewId]
    );
    const productId = productIdRequest.rows[0].product_id;

    // Delete the review
    await pool.query("DELETE FROM product_reviews WHERE id = $1", [reviewId]);

    // Calculate average rating
    const avgRatingRequest = await pool.query(
      "SELECT AVG(rating) AS avg_rating FROM product_reviews WHERE product_id = $1",
      [productId]
    );
    const avgRating = avgRatingRequest.rows[0].avg_rating || 0;

    // Update the average rating in the products table
    await pool.query("UPDATE products SET star_point = $1 WHERE id = $2", [
      avgRating,
      productId,
    ]);

    await updateManufacturerRating(manufacturer_id);

    res.status(200).json({ message: "Review deleted successfully." });
  } catch (error) {
    console.error("Error deleting review:", error.message);
    res.status(500).json({ message: "Server Error." });
  }
});

app.get("/getCoupons", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM coupons ORDER BY validity_end_date DESC"
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.get("/getSavedAddressesOfUser/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;

    const result = await pool.query(
      "SELECT * FROM users_saved_addresses WHERE user_id = $1 ",
      [userId]
    );

    const modifiedRows = result.rows.map((row) => {
      // Add your additional field here
      return {
        ...row,
        full_address: `${row.province} province, ${row.district} district, ${row.neighborhood} neighborhood, ${row.street} street, building ${row.building_number}, floor ${row.floor_number}, door ${row.door_number}`,
      };
    });

    res.status(200).json(modifiedRows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.put("/saveNewAddressToCurrentUser/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const { address_data } = req.body;
    const result = await pool.query(
      "INSERT INTO users_saved_addresses VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [
        user_id,
        address_data.province,
        address_data.district,
        address_data.neighborhood,
        address_data.street,
        address_data.building_number,
        address_data.floor_number,
        address_data.door_number,
        address_data.receiver_full_name,
        address_data.receiver_phone_number,
        address_data.address_title,
      ]
    );

    res.status(201).json({ message: "Address saved successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error." });
  }
});

app.post("/addToFavorite/:user_id/:product_id", async (req, res) => {
  const user_id = req.params.user_id;
  const product_id = req.params.product_id;

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

app.delete("/removeFromCart/:user_id/:product_id", async (req, res) => {
  const user_id = req.params.user_id;
  const product_id = req.params.product_id;

  try {
    const request = await pool.query(
      "DELETE FROM users_cart WHERE user_id = $1 AND product_id = $2",
      [user_id, product_id]
    );

    res.status(200).send();
  } catch (err) {
    res.status(500).send();
    console.error(err.message);
  }
});

app.get("/getManufacturerAndProducts/:manufacturer_id", async (req, res) => {
  try {
    const manufacturer_id = req.params.manufacturer_id;
    const manufacturerQuery = `
      SELECT
        *
      FROM manufacturers
      WHERE manufacturer_id = $1;
    `;
    const manufacturerRequest = await pool.query(manufacturerQuery, [
      manufacturer_id,
    ]);
    const manufacturerInfo = manufacturerRequest.rows[0];

    const productsQuery = `
    SELECT
    p.id,
    p.manufacturer_id,
    p.product_name,
    p.price,
    p.discounted_price,
    p.image,
    p.star_point,
    p.description,
    p.stock_quantity,
    p.to_be_delivered_date,
    p.product_status,
    p.category_id,
    p.sub_category_id,
    c.category_name,
    sc.sub_category_name,
    pc.campaign_text,
    COUNT(pr.rating) AS ratings_count,
    m.manufacturer_name
  
  FROM products p
  LEFT JOIN product_reviews pr ON p.id = pr.product_id
  LEFT JOIN product_campaigns pc ON p.id = pc.product_id
  LEFT JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
  LEFT JOIN categories c ON p.category_id = c.category_id
  LEFT JOIN sub_categories sc ON p.sub_category_id = sc.sub_category_id WHERE p.manufacturer_id = $1 GROUP BY 
  p.id, 
  c.category_name,
  m.manufacturer_id, 
  pc.campaign_text, 
  c.category_name,
  sc.sub_category_name,
  m.manufacturer_name;
    `;
    const productsRequest = await pool.query(productsQuery, [manufacturer_id]);
    const productsOfManufacturer = productsRequest.rows;

    const productsRows = productsRequest.rows;

    // Modify the structure inside the productsMap to include an array for ratings
    const productsMap = new Map();

    productsRows.forEach((item) => {
      const id = item.id;
      if (!productsMap.has(id)) {
        productsMap.set(id, {
          product_id: item.id,
          manufacturerId: item.manufacturer_id,
          productName: item.product_name,
          price: item.price !== null ? +item.price : null,
          discountedPrice:
            item.discounted_price !== null ? +item.discounted_price : null,
          image: item.image,
          description: item.description,
          category_name: item.category_name,
          sub_category_name: item.sub_category_name,
          stockQuantity: item.stock_quantity,
          toBeDeliveredDate: item.to_be_delivered_date,
          productStatus: item.product_status,
          ratings: [], // Include an array to store ratings
          ratingsCount: item.ratings_count,
          campaigns: [],
          manufacturerName: item.manufacturer_name,
          category_id: item.category_id,
          sub_category_id: item.sub_category_id,
          starPoint: item.star_point,
        });
      }

      if (item.campaign_text !== null) {
        productsMap.get(id).campaigns.push(item.campaign_text);
      }
    });

    // Convert the map of products to an array
    const products = Array.from(productsMap.values());

    const responseData = {
      manufacturerInfo: manufacturerInfo,
      productsOfManufacturer: products,
    };

    res.json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error." });
  }
});

async function updateManufacturerRating(manufacturer_id) {
  try {
    // Ortalama değeri hesapla
    const avgRatingRequest = await pool.query(
      "SELECT AVG(pr.rating) AS avg_rating FROM product_reviews pr JOIN products p ON pr.product_id = p.id WHERE p.manufacturer_id = $1",
      [manufacturer_id]
    );
    const avgRating = avgRatingRequest.rows[0].avg_rating || 0;

    // Üreticinin ortalama değerini güncelle
    await pool.query(
      "UPDATE manufacturers SET manufacturer_rating = $1 WHERE manufacturer_id = $2",
      [avgRating, manufacturer_id]
    );
  } catch (error) {
    console.error("Error updating manufacturer rating:", error.message);
    throw error;
  }
}

app.listen(3002, () => {
  console.log("Server has started on port 3002");
});
