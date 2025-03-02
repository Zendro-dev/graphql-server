const path = require('path');
const { initializeZendro } = require("./zendro.js");

// Check that the correct parameters are passed
const migrationFileName = process.argv[2]; // The migration file name
const action = process.argv[3]; // The up or down parameter

// If required parameters are missing, display an error message and exit
if (!migrationFileName || (action !== 'up' && action !== 'down')) {
  console.log('Please pass the file and the action (up or down) as parameters:');
  console.log('Example: node runMigration.js migration.js up');
  process.exit(1);
}

// Build the absolute path of the migration file
console.log(__dirname);
const migrationFilePath = path.join(__dirname, '../', migrationFileName);
console.log(migrationFilePath);

// Dynamically import the migration file
let migration;
try {
  migration = require(migrationFilePath);
} catch (error) {
  console.log(`Error loading the migration file: ${error.message}`);
  process.exit(1);
}



// Execute the corresponding action
(async () => {
  try {
    const zendro = await initializeZendro();
    if (action === "up" && typeof migration.up === 'function') {
      await migration.up(zendro);  // Execute the "up" function
    } else if (action === "down" && typeof migration.down === 'function') {
      await migration.down(zendro);  // Execute the "down" function
    } else {
      console.log(`The action '${action}' is not defined in the migration file.`);
      
    }
    process.exit(1);
  } catch (error) {
    console.error("Error during migration:", error.message);
    process.exit(1);
  }
})();
