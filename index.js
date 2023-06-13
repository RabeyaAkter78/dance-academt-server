const express = require('express');
const app = express();
const cors = require('cors');
var jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.PORT || 5000;


// midleware:
app.use(cors());
app.use(express.json());

// verify jwt:
const verifyJWt = (req, res, next) => {
    const authorization = req.headers.authorization;
    // console.log(authorization);
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

}



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
        await client.connect();

        const classCollection = client.db("danceDb").collection("class");
        const eventCollection = client.db("danceDb").collection("event");
        const userCollection = client.db("danceDb").collection("user");
        const instructorCollection = client.db("danceDb").collection("instructor");
        const courseCollection = client.db("danceDb").collection("course");

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
        }



        app.get('/class', async (req, res) => {
            const result = await courseCollection.find().sort({ student_number: -1 }).toArray();
            // const result = await classCollection.find().sort({ student_number: -1 }).toArray();
            res.send(result);
        })
        app.get('/event', async (req, res) => {
            const result = await eventCollection.find().toArray();
            res.send(result);
        })
        app.get('/instructor', async (req, res) => {
            const result = await instructorCollection.find().toArray();
            res.send(result);
        })


        // get User from db:
        app.get('/users', verifyJWt, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        // add user api in db:
        app.post('/users', async (req, res) => {
            const user = req.body;
            // console.log('user:', user);

            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            // console.log('existing user:', existingUser);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

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

        // get admin by email
        app.get('/users/admin/:email', verifyJWt, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await userCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })


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
        // get instructor by emial
        app.get('/users/instructor/:email', verifyJWt, async (req, res) => {
            const email = req.params.email;
            // console.log(158, email)

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await userCollection.findOne(query);
            const result = { instructor: user.role === 'instructor' }
            // console.log(168, result)
            res.send(result);
        })


        // delete user:
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })



        // get class by instructor:
        // app.get("/course", async (req, res) => {
        app.get("/myClass", async (req, res) => {
            const email = req.query.email;
            const isTrue = req.query.isSort;
            console.log(187, email, isTrue)
            if (isTrue === "true") {
                const result = await courseCollection.find({ email: email }).sort({ createdAt: -1 }).toArray();
                res.send(result);
                return;
            }
            const result = await courseCollection.find({ email: email }).sort({ createdAt: 1 }).toArray();
            res.send(result);
        })

        // add class ny instructor:

        // app.post('/course', async (req, res) => {
        app.post('/addAClass', async (req, res) => {
            const classes = req.body;
            // classes.createdAt = new Date();
            if (!classes) {
                return res.status(404).send({ message: "invalid request" })
            }
            const result = await courseCollection.insertOne(classes);
            console.log(189, classes);
            res.send(result)
        })

        // app.post('/course', async (req, res) => {
        //     const newClass = req.body;
        //     const result = await courseCollection.insertOne(newClass)
        //     res.send(result);
        //     console.log(214, result);

        // })


        // get all course for classes page:
        app.get('/course', async (req, res) => {
            const result = await courseCollection.find().toArray();
            res.send(result);
            // console.log('result', result);

        })

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
})

app.listen(port, () => {
    console.log(`damce academy is running on port:${port}`);

})