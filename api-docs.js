/* Documentation interactive de l'API (Swagger UI, fourni localement).
 * Les requêtes « Try it out » reçoivent l'en-tête anti-CSRF exigé par le
 * serveur ; le cookie de session est celui de l'onglet calculBA déjà connecté. */
"use strict";
window.ui = SwaggerUIBundle({
  url: "/openapi.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
  docExpansion: "list",
  defaultModelsExpandDepth: 0,
  requestInterceptor: (req) => {
    req.headers["X-Requested-With"] = "calculBA";
    return req;
  },
});
