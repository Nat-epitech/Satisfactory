'use strict';
var express = require('express');
var mysql = require('mysql2');

var router = express.Router();
var mysqlPool = mysql.createPool({
	host: "localhost",
	user: "ndp",
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
	var recetteResources = [];
	var rawMaterial = [];
	var nbrFactory = [];
	var finded;

	mysqlPool.query('SELECT * FROM resources WHERE idResource = ?', [req.query.resourceWanted], async (error, resource, fields) => {
		if (error) throw error;
		recetteResources = recetteResources.concat(await getRessource(req.query.resourceWanted, req.query.resourceQuantity, -1));
		
		//Calcul du cout détaillé
		for (let i = 0; i < recetteResources.length; i++) {
			recetteResources[i].setId = i;
			if (recetteResources[i].resourceLvl != 0) {
				recetteResources = recetteResources.concat(await getRessource(recetteResources[i].idResource, recetteResources[i].quantity, recetteResources[i].setId));
			}
		}

		//Calcul du cout en minerais
		for (let i = 0; i < recetteResources.length; i++) {
			if (recetteResources[i].resourceLvl == 0) {
				finded = false
				for (let j = 0; j < rawMaterial.length; j++) {
					if (rawMaterial[j].idResource == recetteResources[i].idResource) {
						rawMaterial[j].quantity += recetteResources[i].quantity;
						finded = true;
						break;
					}
				}
				if (finded == false) {
					const idResource = recetteResources[i].idResource;
					const resourceName = recetteResources[i].resourceName;
					const quantity = recetteResources[i].quantity;
					rawMaterial.push({ idResource, resourceName, quantity });
				}
			}
		}

		//Calcul des marchines et cout en electicité
		var resourceParentHistory = [];
		let totalMW = 0;
		for (let i = 0; i < recetteResources.length; i++) {
			var idFactory = recetteResources[i].recetteFactory;
			var factoryName = recetteResources[i].factoryName;
			var nbr = 0;
			var price = 0;

			for (let j = 0; j < recetteResources.length; j++) {
				if (recetteResources[j].recetteFactory == idFactory && !resourceParentHistory.includes(recetteResources[j].resourceParent)) {
					nbr += recetteResources[j].nbrFactory;
					price += recetteResources[j].nbrFactory * recetteResources[j].factoryPowerCost;
					resourceParentHistory.push(recetteResources[j].resourceParent);
				}
			}
			if (nbr != 0) {
				nbrFactory.push({ idFactory, factoryName, nbr, price });
			}
		}
		for (let i = 0; i < nbrFactory.length; i++) {
			nbrFactory[i].price = parseFloat(nbrFactory[i].price.toFixed(2));
			nbrFactory[i].nbr = parseFloat(nbrFactory[i].price.toFixed(2));
			totalMW += nbrFactory[i].price;
		}
		totalMW = parseFloat(totalMW.toFixed(2));
		// for (let i = 0; i < recetteResources.length; i++) {
		// 	console.log(recetteResources[i].setId + " " + recetteResources[i].resourceName + " " + recetteResources[i].resourceParent)
		// }
		mysqlPool.query('SELECT * FROM resources WHERE resourceLvl > 0 ORDER BY resourceLvl;', (error, resources, fields) => {
			if (error) throw error;
			res.render('pages/result', {resources, resource, quantity: req.query.resourceQuantity, recetteResources, rawMaterial, nbrFactory, totalMW});
		});
	});
});

module.exports = router;