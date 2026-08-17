(() => {
  "use strict";

  const buttons = [];

  window.ContatoSeguro = {
    register(button) {
      buttons.push(button);
    },
    getButtons() {
      return buttons.slice();
    },
  };
})();
