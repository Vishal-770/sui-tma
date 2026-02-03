import {
  setDebug,
  backButton,
  initData,
  init as initSDK,
  miniApp,
  viewport,
  mockTelegramEnv,
  type ThemeParams,
  themeParams,
  retrieveLaunchParams,
  emitEvent,
} from '@tma.js/sdk-react';

/**
 * Initializes the application and configures its dependencies.
 */
export async function init(options: {
  debug: boolean;
  eruda: boolean;
  mockForMacOS: boolean;
}): Promise<void> {
  // Set @tma.js/sdk-react debug mode and initialize it.
  setDebug(options.debug);
  initSDK();

  // Add Eruda if needed.
  options.eruda &&
    void import('eruda').then(({ default: eruda }) => {
      eruda.init();
      eruda.position({ x: window.innerWidth - 50, y: 0 });
    });

  // Telegram for macOS has a ton of bugs, including cases, when the client doesn't
  // even response to the "web_app_request_theme" method. It also generates an incorrect
  // event for the "web_app_request_safe_area" method.
  if (options.mockForMacOS) {
    let firstThemeSent = false;
    mockTelegramEnv({
      onEvent(event, next) {
        if (event.name === 'web_app_request_theme') {
          let tp: Partial<ThemeParams> = {};
          if (firstThemeSent) {
            const state = themeParams.state;
            tp = state as Partial<ThemeParams>;
          } else {
            firstThemeSent = true;
            const lp = retrieveLaunchParams();
            tp = (lp.tgWebAppThemeParams || {}) as Partial<ThemeParams>;
          }
          return emitEvent('theme_changed', { theme_params: tp as any });
        }

        if (event.name === 'web_app_request_safe_area') {
          return emitEvent('safe_area_changed', {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
          });
        }

        next();
      },
    });
  }

  // Mount all components used in the project.
  backButton.mount();
  initData.restore();

  try {
    themeParams.mount();
    themeParams.bindCssVars();
  } catch (e) {
    // themeParams not available
    console.log('themeParams not available');
  }

  try {
    miniApp.mount();
    miniApp.bindCssVars();
    // Signal that the app is ready
    miniApp.ready();
  } catch (e) {
    // miniApp not available
    console.log('miniApp not available');
  }

  try {
    viewport.mount().then(() => {
      viewport.bindCssVars();
    });
  } catch (e) {
    // viewport not available
  }
}
