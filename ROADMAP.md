# Roadmap

Small, self-contained improvements, done one at a time.

- [x] 1. README: add a screenshot and the live link
- [x] 2. Open Graph / Twitter meta tags so shared links preview nicely
- [x] 3. Keyboard shortcuts in the explorer (← → to move the year, space to play)
- [x] 4. Shareable links: store scenario, year and dial settings in the URL
- [x] 5. Export the current projection as CSV
- [x] 6. Dark mode (follows the system setting)
- [x] 7. Accessibility: data-table fallback for the charts, check focus order and contrast
- [x] 8. Sensor-detection calculator ("how many years until a sensor can see the trend?")
- [x] 9. Region presets: polar, tropical, coastal upwelling
- [ ] 10. Replace the built-in CO₂ history with the official NOAA Mauna Loa file

## Pages and interactive features

Keep the current look. These add to the design rather than replacing it.

- [x] 11. Multi-page structure: move the explorer to `explore.html`, with the side rail linking between pages and shareable links still working
- [x] 12. Scenarios page: move the scenario rows to `scenarios.html` and let visitors overlay any two scenarios on one chart
- [x] 13. Chemistry page: move the species chart to `chemistry.html` and add a "pump in CO₂" control that shows carbonate species shifting step by step
- [x] 14. Methods page: move the checks, cautions, sensor calculator and downloads to `methods.html`
- [x] 15. Timeline page: scroll through 1850–2100 with the model's pH and Ω updating at each milestone year
- [x] 16. Quiz page: predict the model's result, then see the answer computed live

## Polish and extras

None of these need outside data.

- [x] 17. Glossary page: `glossary.html` explaining pH, Ω, pCO₂, alkalinity and the other terms, linked from where each term first appears
- [x] 18. Print styles: charts and tables print cleanly, with the side rail and controls hidden
- [ ] 19. Custom 404 page with links back to each page
- [ ] 20. Download any chart as a PNG image
- [ ] 21. "What changed?" summary on the explorer: plain-language sentence comparing the chosen year with today
- [ ] 22. Remember the last scenario and dial settings between visits (URL settings still win)
- [ ] 23. Marine life page: `life.html` showing which organisms are at risk as Ω falls past each threshold in the model
- [ ] 24. Unit toggle on the explorer: show acidity as pH or as hydrogen-ion concentration
