---
title: JekyllChess
layout: default
---

<h1><img src="/assets/favicon.png" /> {{ site.title }}</h1>

{% for post in site.posts %}

<article class='post'>
  <h1 class='post-title'>
    <a href="{{ site.path }}{{ post.url }}">
      {{ post.title }}
    </a>
  </h1>
  {{ post.excerpt }}
</article>

{% endfor %}
