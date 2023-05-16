'use strict';
var express = require('express');
var mysql = require('mysql2');

var router = express.Router();
var mysqlPool = mysql.createPool({
	host: "localhost",
	user: "root",
	database: "satisfdb",
	password: "root",
	connectionLimit: 100
});

/* GET home page. */
router.get('/', function (req, res) {
	mysqlPool.query('SELECT * FROM resources WHERE resourceLvl > 0 ORDER BY resourceLvl;', (error, resourcesR, fields) => {
		if (error) throw error;
		res.render('pages/home', { resources: resourcesR });
	});
});

const getRessource = (request, quantity, setId) => {
	return new Promise((resolve, reject) => {
		mysqlPool.query('SELECT * FROM recettes WHERE recetteOutput = ?', [request], (error, recetteR, fields) => {
			if (error) {
				return reject(error);
			}
			else if (recetteR.length == 0) {
				var err = new Error("Aucune recette trouvée pour le composant '" + request + "'");
				return reject(err);
			}
			else {
				mysqlPool.query('SELECT * FROM satisfdb.recettesresources JOIN satisfdb.resources on recettesresources.idResource = resources.idResource JOIN satisfdb.recettes on recettesresources.idRecette = recettes.idRecette JOIN satisfdb.factorymachine on recettes.recetteFactory = factorymachine.idFactory WHERE recettesresources.idRecette = ?', [recetteR[0].idRecette], (error, result, fields) => {
					if (error) { return reject(error); }
					var multiplicator = quantity / recetteR[0].recetteQuantity;
					for (let i = 0; i < result.length; i++) {
						result[i].quantity = result[i].quantity * multiplicator;
						result[i].resourceParent = setId;
						result[i].nbrFactory = multiplicator;
					}
					return resolve(result);
				});
			}
		});
	});
};

router.get('/result', function (req, res, next) {
	var recetteResourcesR = [];
	var rawMaterialR = [];
	var nbrFactoryR = [];
	var finded;

	mysqlPool.query('SELECT * FROM resources WHERE idResource = ?', [req.query.resourceWanted], async (error, resourceR, fields) => {
		if (error) throw error;
		recetteResourcesR = recetteResourcesR.concat(await getRessource(req.query.resourceWanted, req.query.resourceQuantity, -1));
		for (let i = 0; i < recetteResourcesR.length; i++) {
			recetteResourcesR[i].setId = i;
			if (recetteResourcesR[i].resourceLvl != 0) {
				recetteResourcesR = recetteResourcesR.concat(await getRessource(recetteResourcesR[i].idResource, recetteResourcesR[i].quantity, recetteResourcesR[i].setId));
			}
		}
		for (let i = 0; i < recetteResourcesR.length; i++) {
			if (recetteResourcesR[i].resourceLvl == 0) {
				finded = false
				for (let j = 0; j < rawMaterialR.length; j++) {
					if (rawMaterialR[j].idResource == recetteResourcesR[i].idResource) {
						rawMaterialR[j].quantity += recetteResourcesR[i].quantity;
						finded = true;
						break;
					}
				}
				if (finded == false) {
					const idResource = recetteResourcesR[i].idResource;
					const resourceName = recetteResourcesR[i].resourceName;
					const quantity = recetteResourcesR[i].quantity;
					rawMaterialR.push({ idResource, resourceName, quantity });
				}
			}
		}

		var resourceParentHistory = [];
		for (let i = 0; i < recetteResourcesR.length; i++) {
			var idFactory = recetteResourcesR[i].recetteFactory;
			var factoryName = recetteResourcesR[i].factoryName;
			var nbr = 0;
			var price = 0;


			for (let j = 0; j < recetteResourcesR.length; j++) {
				if (recetteResourcesR[j].recetteFactory == idFactory && !resourceParentHistory.includes(recetteResourcesR[j].resourceParent)) {
					nbr += recetteResourcesR[j].nbrFactory;
					price += recetteResourcesR[j].nbrFactory * recetteResourcesR[j].factoryPowerCost;
					resourceParentHistory.push(recetteResourcesR[j].resourceParent);
				}
			}
			if (nbr != 0) {
				nbrFactoryR.push({ idFactory, factoryName, nbr, price });
			}
		}
		let totalMW = 0;
		for (let i = 0; i < nbrFactoryR.length; i++) {
			totalMW += nbrFactoryR[i].price;
		}
		// for (let i = 0; i < recetteResourcesR.length; i++) {
		// 	console.log(recetteResourcesR[i].setId + " " + recetteResourcesR[i].resourceName + " " + recetteResourcesR[i].resourceParent)
		// }
		res.render('pages/result', { resource: resourceR, quantity: req.query.resourceQuantity, recetteResources: recetteResourcesR, rawMaterial: rawMaterialR, nbrFactory: nbrFactoryR, totalMW});
	});
});

module.exports = router;


