/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-native-express-outside-adapter",
      comment: "Application and example code must cross the @untrust/mandate-express validation boundary.",
      severity: "error",
      from: {
        pathNot: "^packages/express/"
      },
      to: {
        dependencyTypes: ["npm"],
        path: "(^|/)node_modules/express(?:/|$)"
      }
    }
  ],
  options: {
    doNotFollow: {
      path: "node_modules"
    },
    exclude: {
      path: "(^|/)(dist|coverage)/"
    },
    tsConfig: {
      fileName: "tsconfig.base.json"
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "default"]
    }
  }
};
