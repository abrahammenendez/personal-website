import { createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { buildPageHead, SITE } from '@/lib/seo'

export const Route = createFileRoute('/')({
  head: () => buildPageHead({ title: SITE.name, description: SITE.description, pathname: '/' }),
  component: Home,
})

/** Each link carries its own colour; the palette is defined in styles.css. */
function ExternalLink({
  href,
  className,
  children,
}: Readonly<{ href: string; className: string; children: ReactNode }>) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

function Home() {
  return (
    <main className="flex flex-col gap-4">
      <PageHeader title="Hi!" />

      <p>
        I'm Abraham Menéndez, a 32-year-old Spanish software developer based in Amsterdam, The
        Netherlands.
      </p>

      <p>
        If you've found your way here, you probably already know that I love building software. I'm
        currently doing it at{' '}
        <ExternalLink className="text-link-job" href="https://www.maersk.com/">
          Maersk
        </ExternalLink>{' '}
        as a Freelance Backend Engineer. Before that, I was a Tech Lead at{' '}
        <ExternalLink
          className="text-link-previous-job"
          href="https://techcrunch.com/2022/12/09/instant-grocery-app-getir-acquires-its-competitor-gorillas/"
        >
          Gorillas (acquired by Getir)
        </ExternalLink>
        . You can take a look at{' '}
        <ExternalLink
          className="text-link-history"
          href="https://www.linkedin.com/in/abraham-menendez"
        >
          my full work history on LinkedIn
        </ExternalLink>
        .
      </p>

      <p>
        I'm also a proud small investor in{' '}
        <ExternalLink className="text-link-investment" href="https://gumroad.com/">
          Gumroad
        </ExternalLink>
        , an e-commerce platform that makes it incredibly easy for creators to get paid for their
        work. Feel free to check it out if it piques your interest!
      </p>

      <p>
        As I strongly believe in giving back, you can find me trying to be a helpful Mentor at{' '}
        <ExternalLink className="text-link-oss" href="https://exercism.com/">
          Exercism
        </ExternalLink>
        , a not-for-profit organization dedicated to teaching programming to anyone eager to learn.
      </p>

      <p>
        Social media isn't really my thing (too many distractions these days), but I do have a{' '}
        <ExternalLink className="text-link-social" href={SITE.social.twitter}>
          Twitter
        </ExternalLink>{' '}
        account that I mainly use to retweet other people's opinions. I'm exploring different
        platforms to share more in-depth thoughts, but I haven't found the right one yet.
      </p>

      <p>
        Although I don't have as much spare time as I'd like, I usually try to work on{' '}
        <ExternalLink className="text-link-repos" href={SITE.social.github}>
          small projects
        </ExternalLink>{' '}
        whenever I can. Obviously, most of them end up in the graveyard of unfinished stuff. I'm
        planning to finish something worth talking about this year, so let's keep in touch, OK?
      </p>

      <p>
        See you around, <br />
        <a className="text-link-email" href={`mailto:${SITE.email}`} target="_top">
          Abraham
        </a>
      </p>
    </main>
  )
}
