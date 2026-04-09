const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'Chatapp',
    name: 'Chatapp',
    appCopyright: 'Copyright (c) 2026 REDKING-11',
    win32metadata: {
      CompanyName: 'REDKING-11',
      FileDescription: 'Privacy-first desktop chat',
      OriginalFilename: 'Chatapp.exe',
      ProductName: 'Chatapp',
      InternalName: 'Chatapp'
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-wix',
      config: {
        language: 1033,
        manufacturer: 'REDKING-11',
        name: 'Chatapp',
        shortName: 'Chatapp',
        description: 'Privacy-first desktop chat with local-first encrypted messaging.',
        exe: 'Chatapp.exe',
        upgradeCode: 'fef5f711-cbd1-4a96-80d8-9b08c5ec0fb8',
        nestedFolderName: 'RedFolder',
        programFilesFolderName: 'LibreChat',
        shortcutFolderName: 'Chatapp',
        shortcutName: 'Chatapp',
        defaultInstallMode: 'perUser',
        features: false,
        ui: {
          chooseDirectory: true
        }
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
