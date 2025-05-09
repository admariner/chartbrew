/* This module gets the user information from the token, but doesn't fail in any way */
const jwt = require("jsonwebtoken");

const db = require("../models/models");
const userResponse = require("./userResponse");

const settings = process.env.NODE_ENV === "production" ? require("../settings") : require("../settings-dev");

module.exports = async (req, res, next) => {
  const token = req.headers.authorization ? req.headers.authorization.replace("Bearer ", "") : "";
  if (!token) return next();

  let decoded;
  try {
    decoded = await jwt.verify(token, settings.encryptionKey);
  } catch (err) {
    //
  }

  if (!decoded) {
    try {
      decoded = await jwt.verify(token, settings.secret);

      if (decoded?.project_id) {
        const project = await db.Project.findByPk(decoded.project_id);
        if (project && project.brewName !== req.params.brewName) {
          return res.status(401).send("Not authorized");
        }
      }
    } catch (err) {
      //
    }
  }

  if (!decoded?.id) return next();

  return db.User.findByPk(decoded.id)
    .then((user) => {
      if (!user) return next();

      const userObj = userResponse(user);
      userObj.token = token;
      userObj.admin = user.admin;

      req.user = userObj;
      return next();
    })
    .catch((error) => { return res.status(400).send(error); });
};
