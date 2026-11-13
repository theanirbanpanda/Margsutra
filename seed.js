// Legacy entry point.
//
// The demo data is now created by backend/scripts/reset-demo-data.js, which
// leaves exactly two accounts behind:
//
//   demoadmin@gmail.com / 123456   (admin console)
//   demouser@gmail.com  / 123456   (trekker app)
//
// This file simply forwards to that script so `npm run seed` keeps working.

const path = require("path");

require(path.resolve(__dirname, "backend/scripts/reset-demo-data.js"));
