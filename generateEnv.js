const { writeFileSync, readFileSync } = require("fs");
const glob = require("glob");

glob(__dirname + "/.env", function (er, files) {
  if (files?.length > 0) {
    files.forEach((file) => {
      writeFileSync(file + ".example", readFileSync(file, { encoding: "utf8" }).replace(/=.*$/gm, "="));
    });
  }
});
