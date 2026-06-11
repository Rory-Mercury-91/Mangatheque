/**
 * @description Filtre les lignes de log connues comme bruit non bloquant (build Android/desktop).
 * @param {string} line - Ligne de sortie terminal.
 * @returns {boolean} true si la ligne doit être conservée dans le journal filtré.
 */
export function shouldKeepLogLine(line) {
  const trimmed = line.trimEnd();
  if (!trimmed) {
    return true;
  }

  const noisePatterns = [
    /^\(\!\) Some chunks are larger than 500 kB/,
    /^- Using dynamic import\(\)/,
    /^- Use build\.rollupOptions/,
    /^- Adjust chunk size limit/,
    /^\[DEP0190\] DeprecationWarning: Passing args to a child process/,
    /^Java compiler version 21 has deprecated support for compiling with source\/target version 8\./,
    /^Try one of the following options:/,
    /^\s+\d+\. \[Recommended\] Use Java toolchain/,
    /^\s+\d+\. Set a higher source\/target version/,
    /^\s+\d+\. Use a lower version of the JDK/,
    /^For more details on how to configure these settings, see https:\/\/developer\.android\.com/,
    /^To suppress this warning, set android\.javaCompile/,
    /^Deprecated Gradle features were used in this build/,
    /^You can use '--warning-mode all'/,
    /^For more on this, please refer to https:\/\/docs\.gradle\.org/,
    /^\[Incubating\] Problems report is available at:/,
    /^warning: \[options\] source value 8 is obsolete/,
    /^warning: \[options\] target value 8 is obsolete/,
    /^warning: \[options\] To suppress warnings about obsolete options/,
    /^3 warnings$/,
    /^Supplied consumer proguard configuration does not exist:/,
    /^Using fallback strategy: Compile without Kotlin daemon/,
    /^Try \.\/gradlew --stop if this issue persists\./,
    /^w: file:\/\/.*is deprecated/,
  ];

  return !noisePatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * @description Indique si une ligne correspond à un avertissement Gradle/Kotlin bruyant mais bénin.
 * @param {string} line - Ligne de sortie terminal.
 */
export function isBenignNoiseLine(line) {
  return !shouldKeepLogLine(line);
}
