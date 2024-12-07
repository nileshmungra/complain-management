const { Sequelize, DataTypes } = require('sequelize');
// Replace this with your actual MySQL connection string
const sequelize = new Sequelize('mysql://root:password@localhost:3306/complaints_db');

const Complain = sequelize.define('Complain', {
  srno: { type: DataTypes.STRING, unique: true },
  farmerName: DataTypes.STRING,
  brief: DataTypes.STRING,
  materialDate: DataTypes.DATE,
  complainDate: DataTypes.DATE,
  solveDate: DataTypes.DATE,
  solveDays: DataTypes.INTEGER,
  closeDate: DataTypes.DATE,
  closeDays: DataTypes.INTEGER,
  complainType: DataTypes.STRING,
  dealer: DataTypes.STRING,
  manager: DataTypes.STRING,
  status: DataTypes.STRING,
  solution: DataTypes.TEXT,
  replacement: DataTypes.STRING,
});

module.exports = { sequelize, Complain };
