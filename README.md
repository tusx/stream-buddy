# Stream Buddy
<img src="https://raw.githubusercontent.com/tusx/stream-buddy/main/FireFox/icons/StreamBuddy.png " alt="drawing" style="height:200px;"/>

Stream Buddy is made to watch movies and shows online easily. The extension currently only supports [TMDB](https://www.themoviedb.org/).

You should use [uBlock Origin](https://github.com/gorhill/uBlock) if you plan on using this extension.

Most websites nowadays use streaming API sites to show video players, and they add their ads on top of that, which makes the user experience a lot worse.

With this extension i aim to solve the following issues:
- Make the user experience better overall
- Allow users to keep track of what has been watched
- Allow users to choose which servers (streaming api) to use
- Keep it simple and lightweight
- Support for Android devices

## Installation & Setup
<a href="https://addons.mozilla.org/firefox/addon/streambuddy/"><img src="https://user-images.githubusercontent.com/585534/107280546-7b9b2a00-6a26-11eb-8f9f-f95932f4bfec.png" alt="Install on Firefox"/>

You can install the extension on [FireFox Desktop](https://addons.mozilla.org/en-US/firefox/addon/streambuddy/) and [FireFox Mobile](https://addons.mozilla.org/en-US/firefox/addon/streambuddy/)

After installation, you need to add servers in a JSON format in the extension like this:

```
[
  {
    "name":"vidsrc",
    "movie_url": "https://domain.com/embed/movie?tmdb={{movie-id}}",
    "tv_url": "https://domain.com/embed/tv?tmdb={{tv-id}}&season={{season-id}}&episode={{episode-id}}"
  },
  {
    "name":"embedmaster",
    "movie_url": "https://domain.com/movie/{{movie-id}}",
    "tv_url": "https://domain.com/tv/{{tv-id}}/{{season-id}}/{{episode-id}}"
  },
  {
    "name":"multiembed",
    "movie_url": "https://domain.com/?video_id={{movie-id}}&tmdb=1",
    "tv_url": "https://domain.com/?video_id={{tv-id}}&tmdb=1&s={{season-id}}&e={{episode-id}}"
  },
  {
    "name":"primesrc",
    "movie_url": "https://domain.com/embed/movie?tmdb={{movie-id}}",
    "tv_url": "https://domain.com/embed/tv?tmdb={{tv-id}}&season={{season-id}}&episode={{episode-id}}"
  },
  {
    "name":"frembed",
    "movie_url": "https://domain.com/api/film.php?id={{movie-id}}",
    "tv_url": "https://domain.com/api/serie.php?id={{tv-id}}&sa={{season-id}}&epi={{episode-id}}"
  }
]
```

I have purposefully changed the domain names to domain.com in the URLs so as to not attract any unwanted attention and to keep the extension away from unwanted DMCA stuff, but you should have gotten the idea of how the server's JSON should look.

Where you see `{{movie-id}}` "or" `{{tv-id}}` and others in the URLs, it is there the extension inserts the TMDB IDs and season & episode numbers.

After adding servers, if the submitted JSON is correct, it will add the servers to the extension. It is best to select a default server, so whenever you click on Watch Now, it will automatically load the default server.

## Contributions

Any ideas or contributions are welcome and appreciated.

## Other & Note

- I want to disclose that I have used Gemini & Claude in the making of this extension. i did not mindlessly prompt the Ai to make this extension, but carefully curated prompts and checked the code before adding it to the extension. If you find a mistake made by me or any Ai slip-ups that I have missed, please make an issue so it can be fixed. Thanks.

- The FireFox extension uses `browser.storage.sync` for saving the servers and default server data, which automatically sync between active FireFox browsers if they are logged in with the same account and have this extension installed. So, in theory, if you add servers on one device, it should automatically add those to the other device with the same FireFox account. `(not tested yet but will do so once the extention gets approved)`

- The `Watch History` is not synced between devices because there is a limit on how much data an extension can sync according to FireFox, which is 100 kb or 102400 bytes to be exact. The `Watch History` is stored using `IndexedDB` and can be in the MB range so it won't be synced between browsers.

- I have not fully tested the extension on mobile but from what i could check for mobile view using Dev Tools, the extension seems to perform similarly.











