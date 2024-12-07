// This is a test comment


const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const xlsx = require("xlsx");
const { format } = require("date-fns");
const moment = require('moment');
const app = express();
const PORT = 3000;

// Ensure upload directory exists
const uploadPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Middleware setup
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/uploads", express.static(uploadPath));

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage: storage });

// Initialize SQLite database
const db = new sqlite3.Database("./complaints.db", (err) => {
  if (err) {
    console.error("Error connecting to database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// Sample data for the demo Excel file
const sampleData = [
  {
    "farmer name / dealer name": "John Doe",
    "short brief of complaints": "Water shortage",
    "material supply date": "01-01-2024",
    "complain date": "05-01-2024",
    "solve date": "10-01-2024",
    "close date": "15-01-2024",
    "solve days": 5,
    "close days": 10,
    "complain type": "Water Issue",
    "dealer name": "Dealer A",
    "area manager": "Manager X",
    "status": "Closed",
    "description for solution": "Provided water supply.",
  },
  // You can add more sample rows here
];

app.get("/download-sample-excel", (req, res) => {
  // Create a new workbook
  const wb = xlsx.utils.book_new();

  // Convert the sample data to a worksheet
  const ws = xlsx.utils.json_to_sheet(sampleData);

  // Append the worksheet to the workbook
  xlsx.utils.book_append_sheet(wb, ws, "Complaints");

  // Define the path to save the file temporarily
  const filePath = path.join(__dirname, "sample_complaints.xlsx");

  // Write the workbook to a file
  xlsx.writeFile(wb, filePath);

  // Send the file as a download
  res.download(filePath, (err) => {
    if (err) {
      console.error("Error sending file:", err);
      res.status(500).send("Error downloading the sample Excel file.");
    }

    // Remove the temporary file after sending
    fs.unlinkSync(filePath);
  });
});

// Create `complaints` table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS complaints (
    srno TEXT PRIMARY KEY,
    farmerName TEXT,
    complaintBrief TEXT,
    materialSupplyDate TEXT,
    complainDate TEXT,
    solveDate TEXT,
    closeDate TEXT,
    solveDays INTEGER,
    closeDays INTEGER,
    complainType TEXT,
    dealerName TEXT,
    areaManager TEXT,
    status TEXT,
    solutionDescription TEXT,
    complainForm TEXT,
    photo TEXT,
    video TEXT,
    replacementReceived TEXT
  )
`);

// Utility function to generate serial numbers
function generateSerialNumber(count) {
  return `C${String(count + 1).padStart(4, "0")}`;
}

// Route: Display complaints with pagination
app.get("/", (req, res) => {
  let { page = 1, pageSize = 10, sortBy = 'srno', order = 'asc' } = req.query;

  // Parse `page` and `pageSize` as integers
  page = parseInt(page, 10);
  pageSize = pageSize === "all" ? "all" : parseInt(pageSize, 10);

  const limit = pageSize === "all" ? -1 : pageSize;
  const offset = limit === -1 ? 0 : (page - 1) * limit;

  let query = "SELECT * FROM complaints";

  if (sortBy) {
    query += ` ORDER BY ${sortBy} ${order === 'desc' ? 'DESC' : 'ASC'}`;
  }

  // Append LIMIT and OFFSET only if limit is not -1
  if (limit !== -1) {
    query += " LIMIT ? OFFSET ?";
  }

  const params = limit === -1 ? [] : [limit, offset];

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Error fetching complaints:", err.message);
      return res.status(500).send("Error loading complaints.");
    }

    // Format the serial numbers as "C0001", "C0002", etc.
    const complaints = rows.map((row, index) => ({
      ...row,
      displaySrno: `C${String(offset + index + 1).padStart(4, "0")}`, // Dynamic numbering
    }));

    db.get("SELECT COUNT(*) AS total FROM complaints", [], (err, countRow) => {
      if (err) {
        console.error("Error counting complaints:", err.message);
        return res.status(500).send("Error counting complaints.");
      }

      const totalRecords = countRow.total;
      const isLastPage = pageSize === "all" || (page * pageSize >= totalRecords);

      res.render("index", {
        complaints,
        currentPage: page,
        pageSize,
        isLastPage,
      });
    });
  });
});

// Route: Render Add Complaint page
app.get("/add", (req, res) => res.render("edit", { complaint: null }));

// Route: Render Edit Complaint page
app.get("/edit/:srno", (req, res) => {
  const { srno } = req.params;
  console.log("Fetching complaint with srno:", srno); //debugging
  
  db.get("SELECT * FROM complaints WHERE srno = ?", [srno], (err, complaint) => {
    if (err) {
      console.error("Error fetching complaint:", err.message);
      return res.status(500).send("Error loading complaint data.");
    }
    if (!complaint) {
      console.log("No complaint found with srno:", srno); // debugging
	  return res.status(404).send("Complaint not found.");
    }
	
	// Format dates to YYYY-MM-DD for input fields
    const formattedComplaint = {
      ...complaint,
      materialSupplyDate: moment(complaint.materialSupplyDate, "DD-MM-YYYY").format("YYYY-MM-DD"),
      complainDate: moment(complaint.complainDate, "DD-MM-YYYY").format("YYYY-MM-DD"),
      solveDate: moment(complaint.solveDate, "DD-MM-YYYY").format("YYYY-MM-DD"),
      closeDate: moment(complaint.closeDate, "DD-MM-YYYY").format("YYYY-MM-DD"),
    };

    res.render("edit", { complaint : formattedComplaint});
  });
});

// Route: Delete a complaint
app.get("/delete/:srno", (req, res) => {
  const { srno } = req.params;

  db.run("DELETE FROM complaints WHERE srno = ?", [srno], (err) => {
    if (err) {
      console.error("Error deleting complaint:", err.message);
      return res.status(500).send("Error deleting complaint.");
    }
    res.redirect("/");
  });
});

// Route: Save or update a complaint
app.post(
  "/save",
  upload.fields([
    { name: "complainForm", maxCount: 1 },
    { name: "photo", maxCount: 5 },
    { name: "video", maxCount: 5 },
  ]),
  async (req, res) => { // Added async here
    const {
      srno,
      farmerName,
      complaintBrief,
      materialSupplyDate,
      complainDate,
      solveDate,
      complainType,
      dealerName,
      areaManager,
      status,
      solutionDescription,
      replacementReceived,
    } = req.body;

    const solveDays = solveDate ? (new Date(solveDate) - new Date(complainDate)) / (1000 * 3600 * 24) : null;
    const complainForm = req.files?.complainForm?.[0]?.filename || null;
    const photo = req.files?.photo?.map((file) => file.filename).join(",") || null;
    const video = req.files?.video?.map((file) => file.filename).join(",") || null;

    if (srno) {
      // Update existing complaint
      db.run(
        `
        UPDATE complaints SET 
          farmerName = ?, complaintBrief = ?, materialSupplyDate = ?, complainDate = ?, solveDate = ?, solveDays = ?,
          complainType = ?, dealerName = ?, areaManager = ?, status = ?, solutionDescription = ?, replacementReceived = ?,
          complainForm = ?, photo = ?, video = ? WHERE srno = ?`,
        [
          farmerName,
          complaintBrief,
          materialSupplyDate,
          complainDate,
          solveDate,
          solveDays,
          complainType,
          dealerName,
          areaManager,
          status,
          solutionDescription,
          replacementReceived,
          complainForm,
          photo,
          video,
          srno,
        ],
        (err) => {
          if (err) {
            console.error("Error updating complaint:", err.message);
            return res.status(500).send("Error updating complaint.");
          }
          res.redirect("/");
        }
      );
    } else {
      // Insert new complaint
      try {
        const newSrno = generateSerialNumber(await getComplaintCount());

        db.run(
          `
          INSERT INTO complaints (
            srno, farmerName, complaintBrief, materialSupplyDate, complainDate, solveDate, solveDays, complainType,
            dealerName, areaManager, status, solutionDescription, complainForm, photo, video, replacementReceived
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newSrno,
            farmerName,
            complaintBrief,
            materialSupplyDate,
            complainDate,
            solveDate,
            solveDays,
            complainType,
            dealerName,
            areaManager,
            status,
            solutionDescription,
            complainForm,
            photo,
            video,
            replacementReceived,
          ],
          function (err) {
            if (err) {
              console.error("Error inserting complaint:", err.message);
              return res.status(500).send("Error inserting complaint.");
            }
            res.redirect("/");
          }
        );
      } catch (err) {
        console.error("Error generating serial number or inserting complaint:", err.message);
        res.status(500).send("Internal server error.");
      }
    }
  }
);


function parseDate(dateString) {
  if (!dateString) return null; // Handle empty or undefined date strings
  try {
    // Attempt to parse the date in a flexible way
    const parsedDate = moment(dateString, ["DD-MM-YYYY", "YYYY-MM-DD", "MM-DD-YYYY"], true);
    return parsedDate.isValid() ? parsedDate.format("YYYY-MM-DD") : null;
  } catch (err) {
    console.error("Error parsing date:", err.message);
    return null;
  }
}

/*
// Route: Upload Excel file
app.post('/upload-excel', upload.single('excelFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const insertPromises = data.map(row => {
      const {
        'Sr. No': srno,
        'FARMER NAME / DEALER NAME': farmerName,
        'SHORT BRIEF OF COMPLAINTS': complaintBrief,
        'MATERIAL SUPPLY DATE': materialSupplyDate,
        'COMPLAIN DATE': complainDate,
        'SOLVE DATE': solveDate,
        'SOLVE DAYS': solveDays,
        'CLOSE DATE': closeDate,
        'CLOSE DAYS': closeDays,
        'COMPLAIN TYPE': complainType,
        'DEALER NAME': dealerName,
        'AREA MANAGER': areaManager,
        'SOLUTION STATUS': status,
        'DESCRIPTION FOR SOLUTION': solutionDescription,
      } = row;

      return new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO complaints (
            srno, farmerName, complaintBrief, materialSupplyDate, complainDate, solveDate, solveDays,
            closeDate, closeDays, complainType, dealerName, areaManager, status, solutionDescription
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [srno, farmerName, complaintBrief, materialSupplyDate, complainDate, solveDate, solveDays,
            closeDate, closeDays, complainType, dealerName, areaManager, status, solutionDescription],
          (err) => {
            if (err) reject(err);
            resolve();
          }
        );
      });
    });

    Promise.all(insertPromises)
      .then(() => res.redirect('/'))
      .catch(err => {
        console.error('Error inserting data:', err.message);
        res.status(500).send('Error inserting data.');
      });
  } catch (error) {
    console.error('Error processing Excel:', error.message);
    res.status(500).send('Error processing Excel.');
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

*/


app.post('/upload-excel', upload.single('excelFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const formatDate = (excelDate) => {
      if (typeof excelDate === 'number') {
        // Excel date to JavaScript Date
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        // Format the date as DD-MM-YYYY
        return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
      }
      return excelDate; // return as is if not a number
    };

    const insertPromises = data.map(row => {
      const {
        'Sr. No': srno,
        'FARMER NAME / DEALER NAME': farmerName,
        'SHORT BRIEF OF COMPLAINTS': complaintBrief,
        'MATERIAL SUPPLY DATE': materialSupplyDate,
        'COMPLAIN DATE': complainDate,
        'SOLVE DATE': solveDate,
        'SOLVE DAYS': solveDays,
        'CLOSE DATE': closeDate,
        'CLOSE DAYS': closeDays,
        'COMPLAIN TYPE': complainType,
        'DEALER NAME': dealerName,
        'AREA MANAGER': areaManager,
        'SOLUTION STATUS': status,
        'DESCRIPTION FOR SOLUTION': solutionDescription,
      } = row;

      return new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO complaints (
            srno, farmerName, complaintBrief, materialSupplyDate, complainDate, solveDate, solveDays,
            closeDate, closeDays, complainType, dealerName, areaManager, status, solutionDescription
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            srno,
            farmerName,
            complaintBrief,
            formatDate(materialSupplyDate), // Format date
            formatDate(complainDate),        // Format date
            formatDate(solveDate),           // Format date
            solveDays,                       // Assuming this is a number
            formatDate(closeDate),           // Format date
            closeDays,                       // Assuming this is a number
            complainType,
            dealerName,
            areaManager,
            status,
            solutionDescription
          ],
          (err) => {
            if (err) reject(err);
            resolve();
          }
        );
      });
    });

    Promise.all(insertPromises)
      .then(() => res.redirect('/'))
      .catch(err => {
        console.error('Error inserting data:', err.message);
        res.status(500).send('Error inserting data.');
      });
  } catch (error) {
    console.error('Error processing Excel:', error.message);
    res.status(500).send('Error processing Excel.');
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});





// Utility function to get the count of complaints
function getComplaintCount() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) AS count FROM complaints", [], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row.count);
    });
  });
}

// Route to update replacement status
app.post("/update-replacement/:srno", (req, res) => {
  const { srno } = req.params;

  // Update the replacementReceived status in the database
  db.run("UPDATE complaints SET replacementReceived = 'Yes' WHERE srno = ?", [srno], function(err) {
    if (err) {
      console.error("Error updating replacement status:", err.message);
      return res.status(500).send("Error updating replacement status."); // Handle error properly
    }

    // Redirect to the replacement report page after successful update
    res.redirect("/replacement-report");
  });
});

// Route to display replacement repor;t
app.get("/replacement-report", (req, res) => {bn0
  db.all("SELECT * FROM complaints where replacementReceived='No'", [], (err, rows) => {
    if (err) {
      console.error("Error fetching replacement complaints:", err.message);
      return res.status(500).send("Error loading replacement report.");
    }
    res.render("replacement-report", { complaints: rows });
  });
});


// Start server
app.listen(PORT,'192.168.90.123',() => {
  console.log(`Server is running on http://192.168.90.123:${PORT}`);
});

// kaMKMpD676T@AVH