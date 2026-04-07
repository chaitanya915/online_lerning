// backhend/middleware/auth.js
const jwt = require("jsonwebtoken");

// Use the same JWT_SECRET as in server.js
const JWT_SECRET = "305d963719cf4c43bb471d0e446ee73029550d6592e80045844b6731f0f48d14fb02615df2753b8827f00bc7f5ec98c74e8b1087529ced81bcfef80f8e433cff";

function auth(requiredRole) {
  return (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ message: "No token provided ❌" });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token ❌" });
      }
      
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ message: "Access denied ❌" });
      }
      
      req.user = decoded;
      next();
    });
  };
}

module.exports = auth;