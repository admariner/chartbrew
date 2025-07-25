import {
  Button, Card, CardBody, CardFooter, CardHeader, Divider, Image, Tooltip,
} from "@heroui/react";
import React, { useState } from "react"
import { LuCirclePlay, LuShieldCheck, LuX } from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { completeTutorial, selectUser } from "../../../slices/user";
import startVideoThumbnail from "../../../assets/quick-start-video.jpg";
import QuickStartVideo from "../../../components/QuickStartVideo";
import v4bg from "../../../assets/v4_background.jpg";

function NoticeBoard() {
  const [showQuickStart, setShowQuickStart] = useState(false);

  const user = useSelector(selectUser);

  const dispatch = useDispatch();

  const _onCompleteTutorials = (data) => {
    dispatch(completeTutorial({ user_id: user.id, tutorial: data }));
  };

  return (
    <div className="flex flex-col gap-1">
      {!user?.tutorials?.quickStartVideo && (
        <Card className="mt-4 hidden sm:block" shadow-sm="sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <span className="font-medium">Quick start guide</span>
            <Tooltip content="Close the guide">
              <span className="text-default-500 cursor-pointer" onClick={() => _onCompleteTutorials({ quickStartVideo: true })}>
                <LuX />
              </span>
            </Tooltip>
          </CardHeader>
          <Divider />
          <CardBody>
            <div className="relative pb-[60.25%] h-0 mb-4">
              <Image
                src={startVideoThumbnail}
                alt="Chartbrew quick start video"
                className="rounded-md"
                onClick={() => setShowQuickStart(true)}
              />
              <div className="absolute inset-0 w-full h-full flex flex-col justify-center items-center z-50">
                <Button
                  variant="flat"
                  color="primary"
                  onClick={() => setShowQuickStart(true)}
                  endContent={<LuCirclePlay />}
                  size="lg"
                >
                  Watch video
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {!user?.tutorials?.v4_announcement && (
        <Card className="mt-4 hidden sm:block" shadow-sm="sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <span className="font-medium">Chartbrew v4 is here!</span>
            <Tooltip content="Close the guide">
              <span className="text-default-500 cursor-pointer" onClick={() => _onCompleteTutorials({ v4_announcement: true })}>
                <LuX />
              </span>
            </Tooltip>
          </CardHeader>
          <Divider />
          <CardBody>
            <Image
              src={v4bg}
              alt="Chartbrew v4"
              className="rounded-md"
              onClick={() => window.open("https://chartbrew.com/blog/chartbrew-v4-whats-new/", "_blank")}
            />
          </CardBody>
          <Divider />
          <CardFooter>
            <Button
              color="primary"
              onPress={() => window.open("https://chartbrew.com/blog/chartbrew-v4-whats-new/", "_blank")}
              fullWidth
            >
              {"Check what's new"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {!user?.tutorials?.twoFactorAuth && user?.User2fas && user?.User2fas?.length < 1 && (
        <Card className="mt-4 hidden sm:block" shadow-sm="sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <span className="font-medium">Two-factor Authentication</span>
            <Tooltip content="Close the guide">
              <span className="text-default-500 cursor-pointer" onClick={() => _onCompleteTutorials({ twoFactorAuth: true })}>
                <LuX />
              </span>
            </Tooltip>
          </CardHeader>
          <Divider />
          <CardBody>
            <p>
              {"Protect your account by enabling two-factor authentication. It's easy and only takes a few moments."}
            </p>
          </CardBody>
          <Divider />
          <CardFooter>
            <Link to="/user/profile" className="w-full">
              <Button
                color="primary"
                endContent={<LuShieldCheck />}
                fullWidth
                className="pointer-events-none"
              >
                Set up 2FA
              </Button>
            </Link>
          </CardFooter>
        </Card>
      )}

      {showQuickStart && (
        <QuickStartVideo onClose={() => setShowQuickStart(false)} isOpen={showQuickStart} />
      )}
    </div>
  );
}

export default NoticeBoard
