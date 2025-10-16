import dotenv from "dotenv";
dotenv.config();

import express, { json } from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { GridFSBucket } from "mongodb";

const app = express();
app.use(json());

const mongoURI = process.env.MONGO_URI;

// Conectar con mongoose
mongoose.connect(mongoURI)
  .then(() => console.log("Conexión a MongoDB exitosa"))
  .catch((err) => console.error("Error de conexión a MongoDB:", err));

const conn = mongoose.connection;

let gfsBucket;

conn.once("open", () => {
  gfsBucket = new GridFSBucket(conn.db, { bucketName: "uploads" });
  console.log("GridFSBucket listo");
});

// Configurar multer para almacenar archivos en memoria temporalmente
const storage = multer.memoryStorage();
const upload = multer({ storage });

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://127.0.0.1:5173",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("No permitido por CORS"));
    }
  },
  methods: ["OPTIONS", "GET", "PUT", "PATCH", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "X-Requested-With", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Ruta para subir archivos usando GridFSBucket
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded");

  crypto.randomBytes(16, (err, buf) => {
    if (err) return res.status(500).send("Error generando nombre");

    const filename = buf.toString("hex") + path.extname(req.file.originalname);

    const uploadStream = gfsBucket.openUploadStream(filename);

    uploadStream.end(req.file.buffer);

    uploadStream.on("error", (error) => {
      res.status(500).send(error.message);
    });

    uploadStream.on("finish", () => {
      res.status(201).json({ fileID: uploadStream.id, filename: filename });
    });
  });
});

app.get("/", (req, res) => {
  res.send("API de carga de archivos");
});

app.get("/file/:filename", (req, res) => {
  const { filename } = req.params;

  const downloadStream = gfsBucket.openDownloadStreamByName(filename);

  downloadStream.on("error", () => {
    res.status(404).send("Archivo no encontrado");
  });

  // Opcional: ajustar el content-type dinámicamente si guardas el mime-type en metadatos
  res.set("Content-Type", "image/jpeg");

  downloadStream.pipe(res);
});

const port = process.env.PORT || 4060;

app.set("port", port);

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
