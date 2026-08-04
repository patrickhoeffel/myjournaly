This folder is empty. Soon it will be the root folder for a new web application with subfolder for the react UI and another subfolder for the back end service that supports it. 

The application is called "My Journaly" (myjournaly.ai), and it is one part personal journal, one part healing tool, one part Bible Study, one part emotional support opportunity. 

The application is AI-powered, and supports a variety of tools. 

Here are the fundamental data structures that the app revolves around:
- The user's personal profile - basic personal biographical information like, name, date of birth, place of birth, gender, ethnicity, religious affiliation, ...
- Preferences, Beleifs & Observations - this is a collection of "truths" that we aggregate about the user. Some things they tell us declaratively, and some things the systems infers or observes. All of these "truths" are captured and become part of our working memory that describe the user and provide the user's "Operating Context". Chief among these is the user's operating system of beliefs. All of these "truths" and "beleifs" *can have*: belief statement, captured_on, began_on, ended_on, strength, source_description.
- Events & Experiences - these are things that happened to the user. They always have a begin_datetime and an end_datetime - everything has some sort of duration. We want to allow for every event/experience to have a relationship with one or more beleifs, and in a way that tends to affirm the beleif or reject (dis-affirm) the beleif. This connection is a really big deal. 
- Journal Entries - these are just that. Title, Timestamp, Author, Text, Tags (for grouping purposes)
- Resources - these are any of a wide variety of different teaching, training, educational, or insight resources. They can be websites, courses, videos, podcasts, teachings, Bible verses, or almost anything else. The user can link to them in journal entries, or spawn a journal entry out of a resource (same thing). 

The experience is a website that has several main experiential components:
- User Profile - basic demographics, beliefs, 
- Eexperiences
- Journal entries
- Resources & Tools
- Timeline - this one is a really big deal. As we accumulate information and experiences and journal entries, we will start to be able to create a timeline of the user's life, from birth through today. This timeline will be one of the central narrative tools for the user as they build the story of their life. The timeline will have multiple components such as work/professional events (from/to), relationship events (from/to), family events (from/to), educational experiences (from/to), medical events or seasons (from/to), belief seasons (from/to), spiritual seasons (from/to), and others the user may choose to describe. The point is that as they build out this timeline, the arc of their life will begin to take shape, and a story will start to form. With the timelines will hopefully come some connections, and some insights. 

Each of these experience areas will have a connected chat experience, so that in every area, the user can converse with the system and with their data. 

The system, observing all of the collected narrative, will then start to ask questions, and suggest possible resources that might help them with areas where they are feeling struggle or resistance. The collection of resources becomes the pool or tools from which help is offered. 

Please review this explanation, and suggest a starting point.


