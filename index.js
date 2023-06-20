const express = require('express');
const app = express();
const cors = require('cors');
var jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.SECRET_PAYMENT_KEY)
const port = process.env.PORT || 5000;


// midleware:
app.use(cors());
app.use(express.json());

// verify jwt start:
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'Unauthorized Access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];
    // console.log(token);

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'Unauthorized Access' });
        }
        req.decoded = decoded;
        next();
    })

};
// verify jwt END;

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hwapsgs.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const eventCollection = client.db("danceDb").collection("event");
        const userCollection = client.db("danceDb").collection("user");
        const courseCollection = client.db("danceDb").collection("course");
        const selectedClassCollection = client.db("danceDb").collection("selectedClass");
        const paymentCollection = client.db("danceDb").collection("payments");


        // create JWT Token:
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token });
        });

        //use verifyJWT before using verifyAdmin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden Access' });
            }
            next();
        };

        // Home page api:

        // get All Class for home page (slice(0,6)):
        app.get('/class', async (req, res) => {
            const result = await courseCollection.find().sort({ student_number: -1 }).toArray();
            res.send(result);
        });

        // get all course classes page:
        app.get('/course', async (req, res) => {
            const query = { status: { $nin: ["pending", "denied"] } };
            const result = await courseCollection.find(query).sort({ student_number: -1 }).toArray();
            res.send(result);

        });

        // top Instructor section :
        app.get('/instructor', async (req, res) => {
            const query = { role: "instructor" };
            const result = await userCollection.find(query).limit(6).toArray();
            res.send(result);
        });

        // event section:
        app.get('/event', async (req, res) => {
            const result = await eventCollection.find().toArray();
            res.send(result);
        });

        // get User from db:
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        // add user api in db:
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // DASHBOARD: (USER):

        // set selected class By user SELECTED CLASS:
        app.post('/selectedClass', async (req, res) => {
            const classes = req.body;
            const result = await selectedClassCollection.insertOne(classes);
            res.send(result)
        });

        // get selected classes by user:
        app.get('/selectedClass', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await selectedClassCollection.find(query).toArray();
            res.send(result);
        });

        //CREATE PAYMENT INTENT (stripe):
        app.post('/createPayment', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseFloat(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });


        // set PAYMENT Api:(remove selected class after successfully payment)
        app.post('/payments', verifyJWT, async (req, res) => {
            // insert class:
            const payment = req.body;
            const id = payment.id;
            const query = { _id: new ObjectId(id) }
            console.log(339, payment);

            payment.createdAt = new Date();
            const insertResult = await paymentCollection.insertOne(payment);
            const removeResult = await selectedClassCollection.deleteOne(query);

            res.send({ insertResult, removeResult });
        });

        // GET PAYMENT HISTORY:
        app.get('/payments', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await paymentCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(result);

        });

        // increase student number after successfully payment:
        app.patch('/courses/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const findedData = await courseCollection.findOne(query)
            const updatedDoc = {
                $set: {
                    student_number: findedData.student_number + 1
                }
            }
            const result = await courseCollection.updateOne(query, updatedDoc)
            res.send(result)
        });


        // DASHBOARD: (ADMIN):

        // set Admin role on db:
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // get admin by email:
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        });

        // managed classes(admin):
        app.get("/manageCourses", async (req, res) => {
            const query = { status: { $in: ["pending", "approved", "denied"] } };
            const result = await courseCollection.find(query).toArray();
            res.send(result)
        });


        // Approved course by Admin:
        app.patch("/aproveCourses/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: "approved"
                }
            }
            const result = await courseCollection.updateOne(query, updatedDoc);
            res.send(result)
            // console.log(248, result);

        });

        // Denied By ADmin :
        app.patch("/deniedCourses/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: "denied"
                }
            }
            const result = await courseCollection.updateOne(query, updatedDoc);
            res.send(result)
            // console.log(248, result);

        });

        // Admin FeedBack:
        app.patch("/adminFeedBack/:id", async (req, res) => {
            const id = req.params.id;
            const feedbackData = req.body;
            // console.log(308, feedbackData, id)
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    feedBack: feedbackData.adminFeedBack
                },
            };
            const result = await courseCollection.updateOne(query, updatedDoc)
            res.send(result);
            // console.log(313, result);


        })



        // delete user by ADMIN On MANAGE USERS page:
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });

        // DASHBOARD: (INSTRUCTOR):

        // set Instructor role:
        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // get instructor by email:
        app.get('/users/instructor/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        });

        // get class by instructor MY CLASS:
        app.get("/myClass", async (req, res) => {
            const email = req.query.email;
            const query = { instructor_email: email }

            const result = await courseCollection.find(query).toArray();
            return res.send(result)

        })


        // set class ny instructor ADD A CLASS:
        app.post('/addAClass', async (req, res) => {
            const classes = req.body;
            classes.createdAt = new Date();
            if (!classes) {
                return res.status(404).send({ message: "invalid request" })
            }
            const result = await courseCollection.insertOne(classes);
            // console.log(207, classes);
            res.send(result)
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('dance academy is running');
});

app.listen(port, () => {
    console.log(`dance academy is running on port:${port}`);

});