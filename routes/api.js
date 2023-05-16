'use strict';
var express = require('express');
var mysql = require('mysql2');
var bcrypt = require('bcrypt');
var nodemailer = require('nodemailer');
require('dotenv').config();

var router = express.Router();
var mysqlPool = mysql.createPool({
	host: process.env.dbHost,
	user: process.env.dbUser,
	database: process.env.dbName,
	password: process.env.dbPassword,
	connectionLimit: 100
});
var transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.mailUser,
		pass: process.env.mailPassword
	}
});

function checkSignIn(req, res, next) {
	if (req.session.userId) {
		next();
	} else {
		var err = new Error("Not logged in!");
		next(err);
	}
}

router.get('/logOut', checkSignIn, function (req, res) {
	req.session.destroy();
	res.redirect('/login');
});

router.get('/ADFavorite', checkSignIn, function (req, res) {
	mysqlPool.query('SELECT * FROM favorites WHERE UserId = ? AND ProductId = ?;', [req.session.userId, req.query.Id], (error, results, fields) => {
		if (error) throw error;
		if (results.length > 0) {
			mysqlPool.query('DELETE FROM `favorites` WHERE UserId = ? AND ProductId = ?;',
				[req.session.userId, req.query.Id], (error, results, fields) => {
					if (error) throw error;
					if (req.query.GoBack) { res.redirect('back'); }
					else { res.json({ cod: 200, message: "ok", newText: "Ajouter aux favoris", newClass: "fa fa-heart-o" }); }
				});
		} else {
			mysqlPool.query('INSERT INTO `favorites` (`UserId`, `ProductId`) VALUES (?, ?);',
				[req.session.userId, req.query.Id], (error, results, fields) => {
					if (error) throw error;
					if (req.query.GoBack == 1) { res.redirect('back'); }
					else { res.json({ cod: 200, message: "ok", newText: "Retirer des favoris", newClass: "fa fa-heart" }); }
				});
		}
	});
});

router.get('/ADCart', checkSignIn, function (req, res) {
	mysqlPool.query('SELECT * FROM carts WHERE IdUser = ? AND IdProduct = ?;', [req.session.userId, req.query.Id], (error, results, fields) => {
		if (error) throw error;
		if (results.length > 0) {
			mysqlPool.query('DELETE FROM `carts` WHERE IdUser = ? AND IdProduct = ?;',
				[req.session.userId, req.query.Id], (error, results, fields) => {
					if (error) throw error;
					res.json({ cod: 200, message: "ok", newText: "Ajouter au panier" });
				});
		} else {
			mysqlPool.query('INSERT INTO `carts` (`IdUser`, `IdProduct`) VALUES (?, ?);',
				[req.session.userId, req.query.Id], (error, results, fields) => {
					if (error) throw error;
					res.json({ cod: 200, message: "ok", newText: "Retirer du panier" });
				});
		}
	});
});

router.post('/auth', function (req, res) {
	mysqlPool.query('SELECT IdAccount, FirstName, Admin, Password, Token FROM accounts WHERE Email = ?;', [req.body.Mail], (error, results, fields) => {
		if (error) throw error;
		if (results.length == 0) { res.redirect('/login?status=401'); }
		else if (results[0].Token != null) { res.redirect('/login?status=403'); }
		else {
			bcrypt.compare(req.body.Password, results[0].Password, function (err, find) {
				if (find) {
					req.session.userId = results[0].IdAccount;
					req.session.firstname = results[0].FirstName;
					req.session.isAdmin = results[0].Admin;
					res.redirect('/store');
				}
				else {
					res.redirect('/login?status=401');
				}
			});
		}
	});
});

function generate_token(length) {
	var a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890".split("");
	var b = [];
	for (var i = 0; i < length; i++) {
		var j = (Math.random() * (a.length - 1)).toFixed(0);
		b[i] = a[j];
	}
	return b.join("");
}

router.post('/register', function (req, res) {
	let Prenom = req.body.Prenom;
	let Nom = req.body.Nom;
	let Mail = req.body.Mail;
	let Telephone = req.body.Telephone;

	if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(Mail)) {
		bcrypt.hash(req.body.Password, process.env.saltRounds | 0, function (err, hash) {
			mysqlPool.query('SELECT IdAccount FROM accounts WHERE Email = ?', [Mail], (error, test, fields) => {
				if (error) throw error;
				if (test.length > 0) { res.redirect('/register?status=409'); }
				else {
					var rand = generate_token(32);
					mysqlPool.query('INSERT INTO `accounts` (`FirstName`, `Name`, `Email`, `Phone`, `Password`, `Token`) VALUES (?, ?, ?, ?, ?, ?);', [Prenom, Nom, Mail, Telephone, hash, rand], (error, results, fields) => {
						if (error) throw error;
						var link = "http://" + req.get('host') + "/api/verify?token=" + rand;
						var mailOptions = {
							from: process.env.mailUser,
							to: Mail,
							subject: 'Veuillez confirmer votre compte',
							html: "Voici le lien pour confirmer votre compte:<br><a href=" + link + ">Cliquez ici pour accéder à l'hyperstore</a>"
						};
	
						transporter.sendMail(mailOptions, function (error, info) {
							if (error) throw error;
							res.redirect('/login?status=403');
						});
					});
				}
			});
		});
	}
	else {res.redirect('/register?status=400');}
});

router.get('/verify', function (req, res) {
	mysqlPool.query('SELECT IdAccount, FirstName, Admin, Token FROM accounts WHERE Token = ?', [req.query.token], (error, account, fields) => {
		if (error) throw error;
		if ((req.protocol + "://" + req.get('host')) == ("http://" + req.get('host'))) {
			if (account.length == 0) { res.redirect('/login?status=498'); }
			else {
				mysqlPool.query('UPDATE `accounts` SET `Token` = NULL WHERE `Token` = ?;', [req.query.token], (error, results, fields) => {
					req.session.userId = account[0].IdAccount;
					req.session.firstname = account[0].FirstName;
					req.session.isAdmin = account[0].Admin;
					res.redirect('/store');
				});
			}
		}
		else { res.redirect('/login?status=498'); }
	});
});

router.post('/editProfil', checkSignIn, function (req, res) {
	var phone = req.body.phone ? req.body.phone : "";
	mysqlPool.query('UPDATE `accounts` SET `FirstName` = ?, `Name` = ?, `Phone` = ? WHERE `IdAccount` = ?;', [req.body.firstName, req.body.name, phone, req.session.userId], (error, results, fields) => {
		if (error) { res.json({ cod: 500, message: "Une erreur est survenue, impossible de modifier les informations du profil." }); };
		req.session.firstname = req.body.firstName;
		mysqlPool.query('UPDATE `orders` SET `OrderCustomer` = ? WHERE `OrderCustomerKey` = ?;', [req.body.email, req.session.userId], (error, results, fields) => {
			if (error) { res.json({ cod: 500, message: "Une erreur est survenue, impossible de modifier les informations du profil." }); };
			res.json({ cod: 200, message: "Les changements ont bien été effectué" });
		});
	});
});

router.post('/editPassword', checkSignIn, function (req, res) {
	mysqlPool.query('SELECT IdAccount, Password FROM accounts WHERE IdAccount = ?;', [req.session.userId], (error, results, fields) => {
		if (error || results.length == 0) { res.json({ cod: 500, message: "Une erreur est survenue, impossible de modifier le mot de passe. 1" }); };
		bcrypt.compare(req.body.Old, results[0].Password, function (err, find) {
			if (find) {
				bcrypt.hash(req.body.New, process.env.saltRounds | 0, function (err, hash) {
					mysqlPool.query('UPDATE `accounts` SET `Password` = ? WHERE `IdAccount` = ?;', [hash, req.session.userId], (error, results, fields) => {
						if (error) { res.json({ cod: 500, message: "Une erreur est survenue, impossible de modifier le mot de passe. 2" }); }
						else { res.json({ cod: 200, message: "Le mot de passe a bien été changé" }); }
					});
				});
			}
			else {
				res.json({ cod: 412, message: "L'ancien mot de passe est incorrect" });
			}
		});
	});
});

router.post('/makeOrder', checkSignIn, function (req, res) {
	mysqlPool.query('SELECT NameFR as Name FROM carts INNER JOIN products ON carts.IdProduct=products.Id WHERE IdUser = ?;', [req.session.userId], (error, products, fields) => {
		if (error) throw error;
		if (products.length == 0) { res.redirect('/user/cart'); return; }
		var OrderProducts = products[0].Name;
		var comment = req.body.orderComment.length > 0 ? req.body.orderComment : "";
		var date = new Date();
		for (let i = 1; i < products.length; i++) { OrderProducts += ", " + products[i].Name; }
		mysqlPool.query('SELECT Email FROM accounts WHERE IdAccount = ?;', [req.session.userId], (error, customer, fields) => {
			if (error) throw error;
			mysqlPool.query('INSERT INTO `orders` (`OrderCustomer`, `OrderCustomerKey`, `OrderDate`, `OrderComment`, `OrderProduct`) VALUES (?, ?, ?, ?, ?);', [customer[0].Email, req.session.userId, date, comment, OrderProducts], (error, results, fields) => {
				if (error) throw error;
				mysqlPool.query('DELETE FROM `carts` WHERE (`IdUser` = ?);', [req.session.userId], (error, results, fields) => {
					if (error) throw error;
					res.redirect('/user');
				});
			});
		});
	});
});

module.exports = router;


