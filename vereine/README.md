# Create JSON file of German clubs

As Swiss-Chess saves only the player's team name instead of the name of its
club in Team Tournaments, you need a JSON file `vereine.json` which provides
the club name for every german club ID.

## Generation

1. Download the current club index `LV-0-csv.ZIP` from the
   [German Chess Association](http://www.schachbund.de/dwz/db/download.html).
2. Unpack it and copy the file `vereine.csv` into the `./vereine` directory.
3. Run `npm run-script build-vereine` to create a new `vereine.json` file.