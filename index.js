const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;
const app = express();

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174" ,"https://library-managment-system-797c1.web.app/"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());


// Verify JWT middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "unauthorized access" });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nghfy93.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const booksCollection = client.db("libraryManagement").collection("books");
    const borrowsCollection = client
      .db("libraryManagement")
      .collection("borrows");

    // JWT generate 
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Clear token on logout
    app.get("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          maxAge: 0,
        })
        .send({ success: true });
    });

    // Get all books data from db
    app.get("/books", async (req, res) => {
      const result = await booksCollection.find().toArray();

      res.send(result);
    });

    // Get a single book data from db using book id
    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    // // Save a borrow data in db
    // app.post("/borrow", async (req, res) => {
    //   const borrowData = req.body;

    //   const result = await borrowsCollection.insertOne(borrowData);
    //   res.send(result);
    // });
    // Save a borrow data in db
    app.post("/borrow", async (req, res) => {
      const borrowData = req.body;

      // Check if it's a duplicate request
      const query = {
        email: borrowData.email,
        bookId: borrowData.bookId,
      };
      const alreadyBorrowed = await borrowsCollection.findOne(query);
      console.log(alreadyBorrowed);

      if (alreadyBorrowed) {
        return res.status(400).send("You have already borrowed this book.");
      }

      const result = await borrowsCollection.insertOne(borrowData);

      //  const updateDoc = {
      //   $inc: { quantity: -1 },
      // }
      // const bookQuery = { _id: new ObjectId(borrowData.bookId) }
      // const updateBookCount = await booksCollection.updateOne(bookQuery, updateDoc)
      // console.log(updateBookCount)
      res.send(result);
    });

    // Get borrowed books by user email
    app.get("/borrowed-books", async (req, res) => {
      const { email } = req.query;
      const query = { email: email };
      const result = await borrowsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/return", async (req, res) => {
      const { bookId, borrowId } = req.body;

      try {
        // Increase the book quantity by 1
        // const bookQuery = { _id: new ObjectId(bookId) };
        // const updateDoc = { $inc: { quantity: 1 } };
        // await booksCollection.updateOne(bookQuery, updateDoc);

        // Remove the borrow record
        const borrowQuery = { _id: new ObjectId(borrowId) };
        const result = await borrowsCollection.deleteOne(borrowQuery);

        res.send(result);
      } catch (err) {
        console.error("Error returning book:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Add a book data in DB with JWT verification
    app.post("/book", verifyToken, async (req, res) => {
      const bookData = req.body;

     
      bookData.createdBy = req.user.id; 

      try {
        const result = await booksCollection.insertOne(bookData);
        res.send(result);
      } catch (err) {
        console.error("Error saving book:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Get all books data from db for pagination
    app.get("/all-books", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const filter = req.query.filter;
      const sort = req.query.sort;
      const search = req.query.search;

      let query = {
        name: { $regex: search, $options: "i" },
      };

      // Check if the filter is for available books (quantity > 0)
      if (filter === "quantity>0") {
        query.quantity = { $gt: 0 };
      }

      let options = {};
      if (sort) options.sort = { rating: sort === "asc" ? 1 : -1 };

      try {
        const result = await booksCollection
          .find(query, options)
          .skip(page * size)
          .limit(size)
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching books:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching books." });
      }
    });

    // Get all books data count from db
    app.get("/books-count", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;

      let query = {
        name: { $regex: search, $options: "i" },
      };

      if (filter === "quantity>0") {
        query.quantity = { $gt: 0 };
      }

      try {
        const count = await booksCollection.countDocuments(query);
        res.send({ count });
      } catch (error) {
        console.error("Error fetching books count:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching books count." });
      }
    });

    // update a book in db
    app.put("/books/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const bookData = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...bookData,
        },
      };
      const result = await booksCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    app.get("/all-books", async (req, res) => {
      const result = await booksCollection.find().toArray();

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello from bookify Server....");
});

app.listen(port, () => console.log(`Server running on port ${port}`));
