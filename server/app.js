const express = require('express');
const fs = require('fs');
const path = require('path');
const hbs = require('hbs');
const MySQL = require('./utilsMySQL');

const app = express();
const port = 3000;

// Detectar si estem al Proxmox (si és pm2)
const isProxmox = !!process.env.PM2_HOME;

// Iniciar connexió MySQL
const db = new MySQL();
if (!isProxmox) {
  db.init({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'root',
    database: 'sakila'   // MODIFICAT: abans era 'escola'
  });
} else {
  db.init({
    host: '127.0.0.1',
    port: 3306,
    user: 'super',
    password: '1234',
    database: 'sakila'   // MODIFICAT: abans era 'escola'
  });
}

// Static files - ONLY ONCE
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Disable cache
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Handlebars
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Registrar "Helpers .hbs" aquí
hbs.registerHelper('eq', (a, b) => a == b);
hbs.registerHelper('gt', (a, b) => a > b);

// Partials de Handlebars
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));

// Route
app.get('/', async (req, res) => {
  try {

    // Obtenir les dades de la base de dades (5 pel·lícules amb actors)
    const moviesRows = await db.query(`
      SELECT f.title, f.release_year,
        GROUP_CONCAT(CONCAT(a.first_name,' ',a.last_name) SEPARATOR ', ') AS actors
      FROM film f
      JOIN film_actor fa ON fa.film_id = f.film_id
      JOIN actor a ON a.actor_id = fa.actor_id
      GROUP BY f.film_id
      LIMIT 5
    `);

    // Obtenir les 5 primeres categories
    const categoriesRows = await db.query(`
      SELECT name FROM category LIMIT 5
    `);

    // Transformar les dades a JSON (per les plantilles .hbs)
    const moviesJson = db.table_to_json(moviesRows, {
      title: 'string',
      release_year: 'number',
      actors: 'string'
    });

    const categoriesJson = db.table_to_json(categoriesRows, {
      name: 'string'
    });

    // Llegir l'arxiu .json amb dades comunes per a totes les pàgines
    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    // Construir l'objecte de dades per a la plantilla
    const data = {
      movies: moviesJson,
      categories: categoriesJson,
      common: commonData
    };

    // Renderitzar la plantilla amb les dades
    res.render('index', data);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// Ruta /movies
app.get('/movies', async (req, res) => {
  try {

    // Obtenir les 15 primeres pel·lícules amb actors
    const moviesRows = await db.query(`
  SELECT f.film_id, f.title, f.release_year,
    GROUP_CONCAT(CONCAT(a.first_name,' ',a.last_name) SEPARATOR ', ') AS actors
  FROM film f
  JOIN film_actor fa ON fa.film_id = f.film_id
  JOIN actor a ON a.actor_id = fa.actor_id
  GROUP BY f.film_id
  LIMIT 15
`);

   const moviesJson = db.table_to_json(moviesRows, {
  film_id: 'number',
  title: 'string',
  release_year: 'number',
  actors: 'string'
});

    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    const data = {
      movies: moviesJson,
      common: commonData
    };

    res.render('movies', data);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// Ruta /movie
app.get('/movie', async (req, res) => {
  try {
    const id = parseInt(req.query.id, 10)

    if (isNaN(id)) {
      return res.status(400).send("Paràmetre id invàlid")
    }

    const rows = await db.query(`
      SELECT film_id, title, description, release_year, language_id
      FROM film
      WHERE film_id = ${id}
    `)

    const movieJson = db.table_to_json(rows, {
      film_id: 'number',
      title: 'string',
      description: 'string',
      release_year: 'number',
      language_id: 'number'
    })

    if (movieJson.length === 0) {
      return res.status(404).send("Pel·lícula no trobada")
    }

    res.render('movie', { movie: movieJson[0] })

  } catch (error) {
    return res.status(500).send("Error consultant la base de dades")
  }
})
//ruta movie edit

app.get('/movieEdit', async (req, res) => {
  const id = parseInt(req.query.id, 10)

  const rows = await db.query(`
    SELECT film_id, title, description, release_year, language_id
    FROM film
    WHERE film_id = ${id}
  `)

  const movieJson = db.table_to_json(rows, {
    film_id: 'number',
    title: 'string',
    description: 'string',
    release_year: 'number',
    language_id: 'number'
  })

  res.render('movieEdit', { movie: movieJson[0] })
})

// Ruta /customers
app.get('/customers', async (req, res) => {
  try {

    // Obtenir els 25 primers clients
    const customersRows = await db.query(`
      SELECT customer_id, first_name, last_name
      FROM customer
      LIMIT 25
    `);

    const customersJson = db.table_to_json(customersRows, {
      customer_id: 'number',
      first_name: 'string',
      last_name: 'string'
    });

    // Per cada client, obtenir els seus 5 primers lloguers
    for (let customer of customersJson) {

      const rentalsRows = await db.query(`
        SELECT f.title
        FROM rental r
        JOIN inventory i ON i.inventory_id = r.inventory_id
        JOIN film f ON f.film_id = i.film_id
        WHERE r.customer_id = ${customer.customer_id}
        LIMIT 5
      `);

      customer.rentals = db.table_to_json(rentalsRows, {
        title: 'string'
      });
    }

    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    const data = {
      customers: customersJson,
      common: commonData
    };

    res.render('customers', data);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// POST editarPeli
app.post('/editarPeli', async (req, res) => {
  try {
    const { film_id, title, description, release_year, language_id } = req.body

    await db.query(`
      UPDATE film
      SET title = "${title}",
          description = "${description}",
          release_year = ${release_year},
          language_id = ${language_id}
      WHERE film_id = ${film_id}
    `)

    res.redirect('/movie?id=' + film_id)

  } catch (err) {
    res.status(500).send("Error editant")
  }
});

//POST Esborrar peli
app.post('/esborrarPeli', async (req, res) => {
  try {
    const { film_id } = req.body

    // Borrar payments asociados a rentals de la película
    await db.query(`
      DELETE p FROM payment p
      JOIN rental r ON p.rental_id = r.rental_id
      JOIN inventory i ON r.inventory_id = i.inventory_id
      WHERE i.film_id = ${film_id}
    `)

    // Borrar rentals
    await db.query(`
      DELETE r FROM rental r
      JOIN inventory i ON r.inventory_id = i.inventory_id
      WHERE i.film_id = ${film_id}
    `)

    // Borrar inventory
    await db.query(`
      DELETE FROM inventory WHERE film_id = ${film_id}
    `)

    // Borrar relaciones simples
    await db.query(`
      DELETE FROM film_actor WHERE film_id = ${film_id}
    `)

    await db.query(`
      DELETE FROM film_category WHERE film_id = ${film_id}
    `)

    // Finalmente borrar película
    await db.query(`
      DELETE FROM film WHERE film_id = ${film_id}
    `)

    res.redirect('/movies')

  } catch (err) {
    console.error(err)
    res.status(500).send("Error esborrant")
  }
})
// GET afegirPeli
app.get('/afegirPeli', (req, res) => {
  res.render('movieAdd');
});

// POST afegirPeli

app.post('/afegirPeli', async (req, res) => {
  try {
    const { title, description, release_year, language_id } = req.body

    await db.query(`
      INSERT INTO film (title, description, release_year, language_id)
      VALUES ("${title}", "${description}", ${release_year}, ${language_id})
    `)

    res.redirect('/movies')

  } catch (err) {
    res.status(500).send("Error afegint pel·lícula")
  }
})



// Start server
const httpServer = app.listen(port, () => {
  console.log(`http://localhost:${port}`);
  console.log(`http://localhost:${port}/movies`);
  console.log(`http://localhost:${port}/customers`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.end();
  httpServer.close();
  process.exit(0);
});